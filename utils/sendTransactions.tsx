import { SignerWalletAdapter } from '@solana/wallet-adapter-base'
import { TransactionInstruction, Keypair } from '@solana/web3.js'
import {
  closeTransactionProcessUi,
  incrementProcessedTransactions,
  showTransactionError,
  showTransactionsProcessUi,
} from './transactionsLoader'
import {
  sendSignAndConfirmTransactions,
  sendSignAndConfirmTransactionsProps,
} from '@blockworks-foundation/mangolana/lib/transactions'

export type WalletSigner = Pick<
  SignerWalletAdapter,
  'publicKey' | 'signTransaction' | 'signAllTransactions'
>

export function getWalletPublicKey(wallet: WalletSigner) {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected!')
  }

  return wallet.publicKey
}

export enum SequenceType {
  Sequential,
  Parallel,
  StopOnFailure,
}

export const sendTransactionsV3 = ({
  connection,
  wallet,
  transactionInstructions,
  timeoutStrategy,
  callbacks,
  config,
}: sendSignAndConfirmTransactionsProps) => {
  const callbacksWithUiComponent = {
    afterBatchSign: (signedTxnsCount) => {
      if (callbacks?.afterBatchSign) {
        callbacks?.afterBatchSign(signedTxnsCount)
      }
      showTransactionsProcessUi(signedTxnsCount)
    },
    afterAllTxConfirmed: () => {
      if (callbacks?.afterAllTxConfirmed) {
        callbacks?.afterAllTxConfirmed()
      }
      closeTransactionProcessUi()
    },
    afterEveryTxConfirmation: () => {
      if (callbacks?.afterEveryTxConfirmation) {
        callbacks?.afterEveryTxConfirmation()
      }
      incrementProcessedTransactions()
    },
    onError: (e, notProcessedTransactions, originalProps) => {
      if (callbacks?.onError) {
        callbacks?.onError(e, notProcessedTransactions, originalProps)
      }
      showTransactionError(
        () =>
          sendTransactionsV3({
            ...originalProps,
            transactionInstructions: notProcessedTransactions,
          }),
        getErrorMsg(e),
        e.txid
      )
    },
  }

  const cfg = {
    maxTxesInBatch:
      transactionInstructions.filter(
        (x) => x.sequenceType === SequenceType.Sequential
      ).length > 0
        ? 20
        : 30,
    autoRetry: false,
    maxRetries: 5,
    retried: 0,
    logFlowInfo: true,
    ...config,
  }
  return sendSignAndConfirmTransactions({
    connection,
    wallet,
    transactionInstructions,
    timeoutStrategy,
    callbacks: callbacksWithUiComponent,
    config: cfg,
  })
}

const getErrorMsg = (e) => {
  if (e.error) {
    return e.error
  }
  if (e.message) {
    return e.message
  }
  if (typeof e === 'object') {
    return tryStringify(e)
  }
  return `${e}`
}

const tryStringify = (obj) => {
  try {
    return JSON.stringify(obj)
  } catch {
    return null
  }
}

export const txBatchesToInstructionSetWithSigners = (
  txBatch: TransactionInstruction[],
  signerBatches: Keypair[][],
  batchIdx?: number
) => {
  return txBatch.map((tx, txIdx) => {
    return {
      transactionInstruction: tx,
      signers:
        typeof batchIdx !== 'undefined' &&
        signerBatches.length &&
        signerBatches[batchIdx] &&
        signerBatches[batchIdx][txIdx]
          ? [signerBatches[batchIdx][txIdx]]
          : [],
    }
  })
}
