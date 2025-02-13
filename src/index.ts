import { decoder } from "./decoder/decoder.js";
import { interpretTransaction } from "./decoder/interpreter.js";
import {
  BUY_TOPIC,
  CHAIN_ID,
  FRAME_ENDPOINT,
  FRAME_V2_ENDPOINT,
  MIN_MOXIE,
  RPC,
  SPAM_LIST,
} from "./constants.js";
import { createPublicClient, webSocket, type Hex } from "viem";
import { getMoxieTokenTypeBySymbol } from "./utils/moxie.js";
import { Effect } from "effect";
import { type InterpretedTransaction } from "@3loop/transaction-interpreter";
import {
  constructBurnMessage,
  constructBuyOrSellMessage,
  constructStakeMessage,
} from "./utils/messages.js";
import { client as fcClient } from "./utils/fc.js";

const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;
const fid = process.env.ACCOUNT_FID;

const isDev = process.env.STAGE === "dev";

const wsClient = createPublicClient({
  transport: webSocket(RPC[CHAIN_ID].url),
});

async function publishToFarcaster(cast: {
  text: string;
  url?: string;
  mentions: number[];
  mentionsPositions: number[];
  parentUrl?: string;
}) {
  if (!signerPrivateKey || !fid) {
    throw new Error("No signer private key or account fid provided");
  }
  const mentions = cast.mentions;

  const publishCastResponse = await fcClient.submitCast(
    {
      text: cast.text,
      mentions,
      mentionsPositions: cast.mentionsPositions,

      ...(cast.url && {
        embeds: [
          {
            url: cast.url,
          },
        ],
      }),
    },
    Number(fid),
    signerPrivateKey
  );
  console.log(`new cast hash: ${publishCastResponse.hash}`);
}

function skipTx(tx: InterpretedTransaction) {
  if (tx.type === "burn" || tx.type === "stake-token") return false;

  if (tx.type !== "swap") return true;

  if (
    (tx.assetsSent.length !== 1 || tx.assetsReceived?.length !== 1) &&
    (tx.assetsReceived.length !== 1 || tx.assetsSent?.length !== 1)
  )
    return true;

  const [moxieToken, fanToken] = tx.action.includes("Sold")
    ? [tx.assetsReceived[0], tx?.assetsSent?.[0]]
    : [tx.assetsSent[0], tx?.assetsReceived?.[0]];

  if (moxieToken?.asset.symbol === "MOXIE" && Number(moxieToken.amount) < MIN_MOXIE)
    return true;

  const fanTokenType = getMoxieTokenTypeBySymbol(fanToken?.asset.symbol!);

  if (fanTokenType === "network") return true;

  return false;
}

async function handleTransaction(txHash?: string) {
  try {
    console.log("Transaction mined!", txHash);
    if (!txHash) return;

    await wsClient.waitForTransactionReceipt({ hash: txHash as Hex });

    const decoded = await decoder.decodeTransaction({
      chainID: CHAIN_ID,
      hash: txHash,
    });

    if (!decoded) return;

    if (SPAM_LIST.includes(decoded.fromAddress.toLowerCase())) return;

    const interpreted = await Effect.runPromise(
      interpretTransaction({
        ...decoded,
        transfers: decoded.transfers.filter((t) => t.amount !== "0"),
      })
    );

    if (skipTx(interpreted)) {
      console.log("skipping transaction", txHash);
      return;
    }

    let message;
    if (interpreted.type === "burn") {
      message = await constructBurnMessage(interpreted, decoded);
    } else if (interpreted.type === "stake-token") {
      message = await constructStakeMessage(interpreted);
    } else {
      message = await constructBuyOrSellMessage(interpreted);
    }

    if (!message) {
      console.log("could not construct message");
      return;
    }

    // let frameUrl = `${FRAME_ENDPOINT}/${CHAIN_ID}/${txHash}`;
    let frameUrl;
    if (interpreted.type === "swap" || interpreted.type === "stake-token") {
      try {
        const trade = await fetch(`${FRAME_V2_ENDPOINT}/generate-trade`, {
          method: "POST",
          body: JSON.stringify({
            hash: txHash,
            feeTaker: interpreted.user.address.toLowerCase(),
            chainId: CHAIN_ID,
          }),
        });

        if (trade.ok) {
          const tradeData = (await trade.json()) as {
            trade: { id?: string };
          };
          if (tradeData.trade.id) {
            frameUrl = `${FRAME_V2_ENDPOINT}/frame/v2?tradeId=${tradeData.trade.id}`;
          }
        }
      } catch (error) {
        console.error(error);
      }
    }

    console.log(message);

    if (isDev) {
      console.log("skipping publish in dev mode");
      return;
    }

    await publishToFarcaster({
      ...message,
      url: frameUrl ?? undefined,
    });
  } catch (e) {
    console.error(e);
  }
}

let lastProcessedAt = Date.now();

async function createSubscription() {
  const response = await wsClient.transport.subscribe({
    method: "eth_subscribe",
    params: [
      //@ts-expect-error
      "logs",
      {
        topics: [BUY_TOPIC],
      },
    ],
    onData: (data: any) => {
      const txHash = data?.result?.transactionHash;
      lastProcessedAt = Date.now();
      if (txHash) handleTransaction(txHash);
    },
    onError: (error: any) => {
      console.error(error);
    },
  });

  const interval = setInterval(() => {
    if (Date.now() - lastProcessedAt > 60_000 * 5) {
      console.error(
        "No new transactions in the last 5 minutes, restarting subscription"
      );
      clearInterval(interval);
      response.unsubscribe();
      createSubscription();
    }
  }, 60_000 * 5);
}

async function main() {
  const server = Bun.serve({
    port: process.env.PORT || 3000,
    fetch(req) {
      return new Response("Moxie Alerts Bot is running!");
    },
  });

  console.log(`Server running on http://localhost:${server.port}`);

  await decoder.decodeTransaction({
    chainID: CHAIN_ID,
    hash: "0x6dd5ffecfe9d6e2d63fe5ed7b0f3b929dc3fcd4e9a00c8fa1064be65306a3f71",
  });

  console.log("Creating subscription");
  createSubscription();
}

// Call the main function to start the server
main().catch(console.error);
