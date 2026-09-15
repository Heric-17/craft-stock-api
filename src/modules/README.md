# Módulos de negócio

Cada módulo de negócio segue **exatamente** a mesma estrutura interna:

```
src/modules/<module>/
  domain/          entidades, value objects, interfaces de repositório, portas, regras puras
  application/     casos de uso, services, facades, DTOs
  infrastructure/  implementações Prisma dos repositórios, mappers, clientes HTTP, adaptadores
  presentation/    controllers e validação de entrada
  <module>.module.ts
```

Direção das dependências — sempre para dentro:

```
presentation  ->  application  ->  domain
                  infrastructure  ->  domain
```

`domain/` é TypeScript puro: não importa Prisma, NestJS, HTTP nem nada de infraestrutura.
Nenhum arquivo fora de `infrastructure/` importa Prisma — nem o pacote `@prisma/client`,
nem o client gerado em `src/shared/infrastructure/prisma/generated/` por caminho relativo.
A regra é verificada pelo ESLint (`no-restricted-imports` em `eslint.config.mjs`),
portanto uma violação quebra o CI.

`health/` é o único módulo presente nesta fase e tem apenas `presentation/`, por não ter
regra de negócio alguma.
