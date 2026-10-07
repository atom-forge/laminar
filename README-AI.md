# Laminar — AI Guide

## What this is

`@atom-forge/laminar` is a lightweight, type-safe layered architecture and dependency injection library for TypeScript. It assembles services, modules, and API components through explicit factories, with typed public/internal interfaces and lifecycle hooks.

## When to use this guide

Read this guide when writing or modifying a Laminar-based application: defining layers, adding component factories, wiring dependencies, or implementing startup and shutdown. It is also a starting point for understanding or changing this library itself.

Laminar is useful when an application needs explicit, typed boundaries between layers without a decorator-based DI framework. Follow the application's existing layer conventions rather than introducing new layers unnecessarily.

## Read next

Read the [English documentation](docs/en/index.md) before generating or changing Laminar code. It contains the API reference, lifecycle constraints, and usage examples, including a complete typed application example.

The same guidance is available in the [Hungarian documentation](docs/hu/index.md).

## Essential constraint

Factories run synchronously in definition order; they are not lazy or automatically dependency-sorted. Defer access to later components until after assembly. Put asynchronous startup in `onInit` hooks and explicitly call `await init(layer)`; use `dispose(layer)` for shutdown.
