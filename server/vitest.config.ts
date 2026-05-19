import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    target: 'es2022',
    // Use tsconfigRaw to disable useDefineForClassFields
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        useDefineForClassFields: false,
      }
    }
  }
})