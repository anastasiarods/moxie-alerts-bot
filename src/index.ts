import { decoder } from "./decoder/decoder.js";
import { transformEvent } from "./decoder/interpreter.js";
import {
  CHAIN_ID,
  ETHERSCAN_ENDPOINT,
  FARCASTER_HUB_URL,
  TOPIC,
} from "./constants.js";
import { HubRestAPIClient } from "@standard-crypto/farcaster-js-hub-rest";
import { createPublicClient, webSocket, type Hex } from "viem";
import { getFarcasterUserInfoByAddress } from "./utils/airstack.js";
import { getAssetMentionName } from "./utils/moxie.js";
import { formatNumber } from "./utils/format.js";

const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;
const fid = process.env.ACCOUNT_FID;
const client = new HubRestAPIClient({
  hubUrl: FARCASTER_HUB_URL,
});

const wsClient = createPublicClient({
  transport: webSocket(process.env.WS_RPC_URL || ""),
});

async function publishToFarcaster(cast: { text: string; url: string }) {
  if (!signerPrivateKey || !fid) {
    throw new Error("No signer private key or account fid provided");
  }

  const publishCastResponse = await client.submitCast(
    {
      text: cast.text,
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

async function constructMessage(interpreted: any) {
  const actor = interpreted.user.address.toLowerCase();
  const context = interpreted.context as {
    spender: string;
    beneficiary: string;
  };
  const spender = context.spender.toLowerCase();
  const beneficiary = context.beneficiary.toLowerCase();

  const actorInfo = await getFarcasterUserInfoByAddress(actor);
  const actorName = actorInfo?.profileName;
  let beneficiaryInfo;

  if (spender !== beneficiary) {
    beneficiaryInfo = await getFarcasterUserInfoByAddress(beneficiary);
  }

  const eventType = interpreted.action.includes("Sold") ? "sold" : "bought";
  const assetSent = interpreted.assetsSent[0];
  const assetReceived = interpreted.assetsReceived[0];

  if (eventType === "sold") {
    const fanToken = getAssetMentionName(assetSent.asset);

    let text = `@${actorName} ${eventType} ${formatNumber(
      assetSent.amount
    )} shares of ${fanToken} for ${formatNumber(assetReceived.amount)} ${
      assetReceived.asset.symbol
    }`;

    if (spender !== beneficiary) {
      text += ` on behalf of @${beneficiaryInfo?.profileName}`;
    }

    return text;
  } else {
    const fanToken = getAssetMentionName(assetReceived.asset);

    let text = `@${actorName} ${eventType} ${formatNumber(
      assetReceived.amount
    )} shares of ${fanToken} for ${formatNumber(assetSent.amount)} ${
      assetSent.asset.symbol
    }`;

    if (spender !== beneficiary) {
      text += ` on behalf of @${beneficiaryInfo?.profileName}`;
    }

    return text;
  }
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

    const interpreted = transformEvent(decoded);
    if (!interpreted || interpreted.type !== "swap") return;
    const message = await constructMessage(interpreted);
    const etherscanUrl = `${ETHERSCAN_ENDPOINT}/tx/${txHash}`;

    console.log(message);
    // await publishToFarcaster({ text: message, url: etherscanUrl });

    console.log(message);
  } catch (e) {
    console.error(e);
  }
}

async function createSubscription() {
  await wsClient.transport.subscribe({
    method: "eth_subscribe",
    params: [
      //@ts-expect-error
      "logs",
      {
        topics: [TOPIC],
      },
    ],
    onData: (data: any) => {
      const txHash = data?.result?.transactionHash;
      if (txHash) handleTransaction(txHash);
    },
    onError: (error: any) => {
      console.error(error);
    },
  });
}

async function main() {
  await handleTransaction(
    "0xa45dd2b567e1db87e70ef1ed56e4054d75de7eb05df8dec8d36949f82ce6bd04"
  );

  // createSubscription();
}

// Call the main function to start the server
main().catch(console.error);
