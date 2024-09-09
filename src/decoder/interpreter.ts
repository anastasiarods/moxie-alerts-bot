import type { DecodedTx, Asset } from "@3loop/transaction-decoder";
import type { AssetTransfer } from "@3loop/transaction-interpreter";

export function assetsSent(
  transfers: Asset[],
  address: string
): AssetTransfer[] {
  return transfers
    .filter((t) => t.from.toLowerCase() === address.toLowerCase())
    .map((t) => {
      return {
        from: { address: t.from, name: null },
        to: { address: t.to, name: null },
        amount: t.amount ?? "0",
        asset: {
          address: t.address,
          name: t.name,
          symbol: t.symbol,
          type: t.type,
          tokenId: t.tokenId,
        },
      };
    });
}

export function assetsReceived(
  transfers: Asset[],
  address: string
): AssetTransfer[] {
  return transfers
    .filter((t) => t.to.toLowerCase() === address.toLowerCase())
    .map((t) => {
      return {
        from: { address: t.from, name: null },
        to: { address: t.to, name: null },
        amount: t.amount ?? "0",
        asset: {
          address: t.address,
          name: t.name,
          symbol: t.symbol,
          type: t.type,
          tokenId: t.tokenId,
        },
      };
    });
}

export function transformEvent(event: DecodedTx) {
  const methodName = event.methodCall.name;
  const baseEvent = {
    chain: event.chainID,
    txHash: event.txHash,
    to: event.toAddress,
    method: methodName,
    user: { address: event.fromAddress, name: null },
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

    if (eventType === "buy") {
      const sent = assetsSent(event.transfers, spender);
      const received = assetsReceived(event.transfers, beneficiary);

      return {
        type: "swap",
        action: `Bought ${received[0].amount} ${received[0].asset.name} for ${sent[0].amount} ${sent[0].asset.name}`,
        ...baseEvent,
        context: {
          spender,
          beneficiary,
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
        action: `Sold ${sent[0].amount} ${sent[0].asset.name} for ${received[0].amount} ${received[0].asset.name}`,
        ...baseEvent,
        context: {
          spender,
          beneficiary,
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
