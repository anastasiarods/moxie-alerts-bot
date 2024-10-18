import type { DecodedTransaction } from "@3loop/transaction-decoder"
import {
  QuickjsConfig,
  QuickjsInterpreterLive,
  TransactionInterpreter,
  fallbackInterpreter,
} from "@3loop/transaction-interpreter"
import { Effect, Layer } from "effect"

const config = Layer.succeed(QuickjsConfig, {
  runtimeConfig: { timeout: 5000 },
})

export const InterpreterLive = Layer.provide(QuickjsInterpreterLive, config)

export const interpretTransaction = (DecodedTransaction: DecodedTransaction) =>
  Effect.gen(function* () {
    const interpreterService = yield* TransactionInterpreter

    let interpreter = interpreterService.findInterpreter(DecodedTransaction)

    if (interpreter == null) {
      interpreter = { id: "fallback", schema: fallbackInterpreter }
    }

    const result = yield* interpreterService.interpretTx(DecodedTransaction, interpreter)

    return result
  }).pipe(Effect.provide(InterpreterLive), Effect.scoped)
