# Async type fix

## A probléma

Az async `assemble` bevezetésével a `define` wrapper factory return típusa `T | Promise<T>` lesz. Emiatt `ReturnType<typeof myFactory>` tartalmazza a `Promise<T>`-t is, és a container típusok öröklik:

```typescript
export type ApiSupport = {
    middlewares: ReturnType<typeof middlewaresSupport>; // T | Promise<T> — hibás
};
```

Futásidőben az `assemble` feloldja a Promise-okat, de a TypeScript ezt nem tudja — a property-k `Promise`-ként jelennek meg.

## A fix: `Component<T>`

```typescript
export type Component<T extends (...args: any[]) => any> = Awaited<ReturnType<T>>;
```

A container típusok `Component<typeof ...>`-ot használnak:

```typescript
export type ApiSupport = {
    constants:   Component<typeof constantsSupport>;
    guards:      Component<typeof guardsSupport>;
    middlewares: Component<typeof middlewaresSupport>;
    session:     Component<typeof sessionSupport>;
};

export type Services = {
    prisma:     Component<typeof prismaService>;
    email:      Component<typeof emailService>;
    attachment: Component<typeof attachmentService>;
};

export type Modules = {
    user:       Component<typeof userModule>;
    conference: Component<typeof conferenceModule>;
    // ...
};
```

`Awaited<ReturnType<T>>` kicsomagolja a Promise-t — a TypeScript a feloldott értéket látja, ugyanúgy ahogy az `assemble` futásidőben feloldja.
