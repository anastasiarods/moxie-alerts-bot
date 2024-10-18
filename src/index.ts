import { decoder } from "./decoder/decoder.js";
import { interpretTransaction } from "./decoder/interpreter.js";
import {
  BUY_TOPIC,
  CHAIN_ID,
  FARCASTER_HUB_URL,
  FRAME_ENDPOINT,
  RPC,
} from "./constants.js";
import { HubRestAPIClient } from "@standard-crypto/farcaster-js-hub-rest";
import { createPublicClient, webSocket, type Hex } from "viem";
import { getMoxieTokenTypeBySymbol } from "./utils/moxie.js";
import { Effect } from "effect";
import { type InterpretedTransaction } from "@3loop/transaction-interpreter";
import {
  constructBurnMessage,
  constructBuyOrSellMessage,
} from "./utils/messages.js";
import axios from "axios";

const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;
const fid = process.env.ACCOUNT_FID;
const axiosInstance = axios.create({
  headers: {
    "Content-Type": "application/json",
    "x-airstack-hubs": process.env.HUB_API_KEY,
  },
});

const client = new HubRestAPIClient({
  axiosInstance,
  hubUrl: FARCASTER_HUB_URL,
});

const wsClient = createPublicClient({
  transport: webSocket(RPC[CHAIN_ID].url),
});

async function publishToFarcaster(cast: {
  text: string;
  url: string;
  mentions: number[];
  mentionsPositions: number[];
  parentUrl?: string;
}) {
  if (!signerPrivateKey || !fid) {
    throw new Error("No signer private key or account fid provided");
  }
  const mentions = cast.mentions;

  const publishCastResponse = await client.submitCast(
    {
      text: cast.text,
      mentions,
      mentionsPositions: cast.mentionsPositions,
      embeds: [
        {
          url: cast.url,
        },
      ],
    },
    Number(fid),
    signerPrivateKey
  );
  console.log(`new cast hash: ${publishCastResponse.hash}`);
}

function skipTx(tx: InterpretedTransaction) {
  if (tx.type === "burn") return false;

  if (tx.type !== "swap") return true;

  if (
    (tx.assetsSent.length !== 1 || tx.assetsMinted?.length !== 1) &&
    (tx.assetsReceived.length !== 1 || tx.assetsBurned?.length !== 1)
  )
    return true;

  const [moxieToken, fanToken] = tx.action.includes("Sold")
    ? [tx.assetsReceived[0], tx?.assetsBurned?.[0]]
    : [tx.assetsSent[0], tx?.assetsMinted?.[0]];

  if (moxieToken?.asset.symbol === "MOXIE" && Number(moxieToken.amount) < 1000)
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
    } else {
      message = await constructBuyOrSellMessage(interpreted);
    }

    if (!message) {
      console.log("could not construct message");
      return;
    }

    const frameUrl = `${FRAME_ENDPOINT}/${CHAIN_ID}/${txHash}`;
    console.log(message);

    await publishToFarcaster({
      ...message,
      url: frameUrl,
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
