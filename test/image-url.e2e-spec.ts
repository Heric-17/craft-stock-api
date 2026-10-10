import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { resolve, join } from 'node:path';

import { HttpStatus, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import type { CompositeProductView } from '../src/modules/composite-products/application/dto/composite-products.dto';
import type { MaterialView } from '../src/modules/materials/application/dto/materials.dto';
import { EnvService } from '../src/config/env.service';
import { resolvePublicBaseUrl } from '../src/shared/infrastructure/storage/public-base-url';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { authenticate } from './support/authenticate';
import { configureTestApp } from './support/configure-test-app';

/** A one-pixel PNG, enough to exercise a real multipart upload. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

/** `<uuid>.<ext>` — the generated key, which is all the URL may end in. */
const UUID_KEY = /\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;

/**
 * The image field used to hand the client the raw storage key, leaving it to
 * know how to build `/uploads/<key>` or a bucket URL — coupling every screen
 * to whichever backend the installation runs. These tests pin the replacement:
 * an absolute URL, derived on read, with the key itself never leaving the API.
 */
describe('Image URLs in responses (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let authHeader: string;
  let publicBase: string;

  let uploadsDir: string;

  const createdUserIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProductIds: string[] = [];
  const uploadedKeys: string[] = [];

  async function createMaterial(): Promise<MaterialView> {
    const response = await request(server)
      .post('/materials')
      .set('Authorization', authHeader)
      .send({
        name: `Farinha ${randomUUID()}`,
        description: null,
        packageCost: '28.00',
        packageQuantity: 1000,
        consumptionUnit: 'GRAM',
        stockQuantity: 1000,
        minimumStockAlert: 100,
      })
      .expect(HttpStatus.CREATED);

    const material = response.body as MaterialView;
    createdMaterialIds.push(material.id);

    return material;
  }

  async function createProduct(): Promise<CompositeProductView> {
    const response = await request(server)
      .post('/composite-products')
      .set('Authorization', authHeader)
      .send({
        name: `Bolo ${randomUUID()}`,
        description: null,
        fixedOperationalCost: '5.00',
        profitMargin: 50,
        billOfMaterials: [],
      })
      .expect(HttpStatus.CREATED);

    const product = response.body as CompositeProductView;
    createdProductIds.push(product.id);

    return product;
  }

  function uploadTo(path: string): request.Test {
    return (
      request(server)
        .post(path)
        .set('Authorization', authHeader)
        .attach('file', PNG_BYTES, {
          filename: 'minha-foto-secreta.png',
          contentType: 'image/png',
        })
        // Not an assertion: a side effect on every upload, so `afterAll` can
        // remove the real files this suite wrote under UPLOADS_DIR.
        .expect((response: request.Response) => {
          const imageUrl = (response.body as { imageUrl?: string | null }).imageUrl;

          if (typeof imageUrl === 'string') {
            uploadedKeys.push(imageUrl.slice(imageUrl.lastIndexOf('/') + 1));
          }
        })
    );
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureTestApp(app, moduleRef);
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = moduleRef.get(PrismaService);

    const env = moduleRef.get(EnvService);
    publicBase = resolvePublicBaseUrl(env.get('PUBLIC_BASE_URL'), env.get('PORT'));
    uploadsDir = resolve(env.get('UPLOADS_DIR'));

    const actor = await authenticate(moduleRef, server);
    authHeader = actor.authHeader;
    createdUserIds.push(actor.userId);
  });

  afterAll(async () => {
    for (const compositeProductId of createdProductIds) {
      const bom = await prisma.billOfMaterials.findUnique({ where: { compositeProductId } });

      if (bom !== null) {
        await prisma.bomItem.deleteMany({ where: { billOfMaterialsId: bom.id } });
        await prisma.billOfMaterials.delete({ where: { id: bom.id } });
      }

      await prisma.compositeProduct.deleteMany({ where: { id: compositeProductId } });
    }

    // `MaterialPriceHistory` belongs to the Material's own aggregate but its
    // FK is `Restrict` like every other (§9), and creating a Material
    // through the API writes a CREATION entry — so it goes first.
    await prisma.materialPriceHistory.deleteMany({
      where: { materialId: { in: createdMaterialIds } },
    });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });

    // The uploads are real files on disk. Removing them keeps a test run from
    // leaving litter under UPLOADS_DIR.
    for (const key of uploadedKeys) {
      await rm(join(uploadsDir, key), { force: true });
    }

    await app.close();
  });

  describe('Material', () => {
    it('has a null imageUrl before any upload, which is a normal state', async () => {
      const material = await createMaterial();

      expect(material.imageUrl).toBeNull();
    });

    it('answers the upload with an absolute URL', async () => {
      const material = await createMaterial();

      const response = await uploadTo(`/materials/${material.id}/image`).expect(HttpStatus.OK);

      const updated = response.body as MaterialView;
      expect(updated.imageUrl).toEqual(expect.stringContaining(`${publicBase}/uploads/`));
      expect(updated.imageUrl).toMatch(UUID_KEY);
    });

    /**
     * Not just the upload response: the URL is derived on every read, so the
     * detail and the listing have to resolve it too.
     */
    it('keeps answering with the absolute URL on a later read', async () => {
      const material = await createMaterial();
      await uploadTo(`/materials/${material.id}/image`).expect(HttpStatus.OK);

      const detail = await request(server)
        .get(`/materials/${material.id}`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);

      expect((detail.body as MaterialView).imageUrl).toMatch(/^https?:\/\//);
      expect((detail.body as MaterialView).imageUrl).toMatch(UUID_KEY);
    });

    it('resolves the URL in the listing as well as the detail', async () => {
      const material = await createMaterial();
      await uploadTo(`/materials/${material.id}/image`).expect(HttpStatus.OK);

      const list = await request(server)
        .get('/materials')
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);

      const listed = (list.body as MaterialView[]).find((entry) => entry.id === material.id);
      expect(listed?.imageUrl).toMatch(UUID_KEY);
    });

    it('goes back to null when the image is removed', async () => {
      const material = await createMaterial();
      await uploadTo(`/materials/${material.id}/image`).expect(HttpStatus.OK);

      const cleared = await request(server)
        .delete(`/materials/${material.id}/image`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);

      expect((cleared.body as MaterialView).imageUrl).toBeNull();
    });

    /**
     * The stored key stays a key: the URL is derived on read (§8.2), so the
     * database carries no hostname and the same data moves between
     * environments unchanged.
     */
    it('persists the key, not the URL', async () => {
      const material = await createMaterial();
      const response = await uploadTo(`/materials/${material.id}/image`).expect(HttpStatus.OK);
      const imageUrl = (response.body as MaterialView).imageUrl as string;

      const row = await prisma.material.findUniqueOrThrow({ where: { id: material.id } });

      expect(row.imageKey).not.toBeNull();
      expect(row.imageKey).not.toMatch(/^https?:\/\//);
      expect(imageUrl.endsWith(row.imageKey as string)).toBe(true);
    });
  });

  describe('CompositeProduct', () => {
    it('has a null imageUrl before any upload', async () => {
      const product = await createProduct();

      expect(product.imageUrl).toBeNull();
    });

    it('answers the upload with an absolute URL', async () => {
      const product = await createProduct();

      const response = await uploadTo(`/composite-products/${product.id}/image`).expect(
        HttpStatus.OK,
      );

      const updated = response.body as CompositeProductView;
      expect(updated.imageUrl).toEqual(expect.stringContaining(`${publicBase}/uploads/`));
      expect(updated.imageUrl).toMatch(UUID_KEY);
    });

    it('persists the key, not the URL', async () => {
      const product = await createProduct();
      await uploadTo(`/composite-products/${product.id}/image`).expect(HttpStatus.OK);

      const row = await prisma.compositeProduct.findUniqueOrThrow({ where: { id: product.id } });

      expect(row.imageKey).not.toMatch(/^https?:\/\//);
    });

    it('goes back to null when the image is removed', async () => {
      const product = await createProduct();
      await uploadTo(`/composite-products/${product.id}/image`).expect(HttpStatus.OK);

      const cleared = await request(server)
        .delete(`/composite-products/${product.id}/image`)
        .set('Authorization', authHeader)
        .expect(HttpStatus.OK);

      expect((cleared.body as CompositeProductView).imageUrl).toBeNull();
    });
  });

  /**
   * The acceptance criterion: no response exposes a relative storage key.
   * Asserted over the raw response text so a key hiding in a field this test
   * does not name still trips it.
   */
  it('exposes no bare storage key in any response that carries an image', async () => {
    const material = await createMaterial();
    const upload = await uploadTo(`/materials/${material.id}/image`).expect(HttpStatus.OK);
    const row = await prisma.material.findUniqueOrThrow({ where: { id: material.id } });
    const key = row.imageKey as string;

    const detail = await request(server)
      .get(`/materials/${material.id}`)
      .set('Authorization', authHeader)
      .expect(HttpStatus.OK);

    for (const response of [upload, detail]) {
      const text = response.text ?? '';
      // The key appears only as the tail of an absolute URL, never alone.
      expect(text).not.toContain(`"${key}"`);
      expect(text).toContain(`${publicBase}/uploads/${key}`);
      expect(text).not.toContain('imageKey');
    }
  });

  /**
   * The bucket is public for reads and so is this mount, so the only thing
   * keeping an image from being found is that its name is an unguessable
   * UUID. A URL carrying any part of the uploaded file name would undo that.
   */
  it('never leaks the uploaded file name into the URL', async () => {
    const material = await createMaterial();

    const response = await uploadTo(`/materials/${material.id}/image`).expect(HttpStatus.OK);

    const imageUrl = (response.body as MaterialView).imageUrl as string;
    expect(imageUrl).not.toContain('minha-foto-secreta');
    expect(imageUrl).toMatch(UUID_KEY);
  });

  it('serves the uploaded image back, with a long cache window', async () => {
    const material = await createMaterial();
    const response = await uploadTo(`/materials/${material.id}/image`).expect(HttpStatus.OK);
    const imageUrl = (response.body as MaterialView).imageUrl as string;

    // Fetch by the path the URL names, which is what a browser would do.
    const served = await request(server).get(new URL(imageUrl).pathname).expect(HttpStatus.OK);

    expect(served.headers['cache-control']).toContain('max-age=31536000');
    expect(served.headers['cache-control']).toContain('immutable');
  });
});
