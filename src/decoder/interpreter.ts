import type { DecodedTx, Asset } from "@3loop/transaction-decoder";

export function assetsSent(transfers: Asset[], address: string) {
  return transfers.filter(
    (t) =>
      t.from.toLowerCase() === address.toLowerCase() &&
      t.amount &&
      t.amount !== "0"
  );
}

export function assetsReceived(transfers: Asset[], address: string) {
  return transfers.filter(
    (t) =>
      t.to.toLowerCase() === address.toLowerCase() &&
      t.amount &&
      t.amount !== "0"
  );
}

export interface InterpretedTx {
  type: "swap" | "unknown";
  action: string;
  chain: number;
  txHash: string;
  to: string | null;
  method: string | null;
  user: string;
  context?: {
    spender: string;
    beneficiary: string;
    buyToken: string;
    sellToken: string;
  };
  assetsSent: Asset[];
  assetsReceived: Asset[];
}

export function transformEvent(event: DecodedTx): InterpretedTx {
  const methodName = event.methodCall.name;
  const baseEvent = {
    chain: event.chainID,
    txHash: event.txHash,
    to: event.toAddress,
    method: methodName,
    user: event.fromAddress,
  };

  const purchaseOrSaleEvent = event.interactions.find(
    (i) =>
      i.event.eventName === "SubjectSharePurchased" ||
      i.event.eventName === "SubjectShareSold"
  );
  const eventType =
    purchaseOrSaleEvent?.event.eventName === "SubjectSharePurchased"
      ? "buy"
      : "sell";

  if (purchaseOrSaleEvent) {
    const params = purchaseOrSaleEvent!.event.params as {
      _spender: string;
      _beneficiary: string;
      _sellToken: string;
      _buyToken: string;
    };
    const spender = params._spender;
    const beneficiary = params._beneficiary;
    const sellToken = params._sellToken;
    const buyToken = params._buyToken;

    if (eventType === "buy") {
      const sent = assetsSent(event.transfers, spender);
      const received = assetsReceived(event.transfers, beneficiary);

      return {
        type: "swap",
        action: `Bought ${received[0].amount} ${received[0].name} for ${sent[0].amount} ${sent[0].name}`,
        ...baseEvent,
        context: {
          spender,
          beneficiary,
          buyToken,
          sellToken,
        },
        assetsSent: sent,
        assetsReceived: received,
      };
    }

    if (eventType === "sell") {
      const sent = assetsSent(event.transfers, beneficiary);
      const received = assetsReceived(event.transfers, spender);

      return {
        type: "swap",
        action: `Sold ${sent[0].amount} ${sent[0].name} for ${received[0].amount} ${received[0].name}`,
        ...baseEvent,
        context: {
          spender,
          beneficiary,
          buyToken,
          sellToken,
        },
        assetsSent: sent,
        assetsReceived: received,
      };
    }
  }

  return {
    type: "unknown",
    action: `Called method '${methodName}'`,
    assetsSent: assetsSent(event.transfers, event.fromAddress),
    assetsReceived: assetsReceived(event.transfers, event.fromAddress),
    ...baseEvent,
  };
}
