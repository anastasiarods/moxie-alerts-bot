import { FARCASTER_HUB_URL } from "../constants";
import axios from "axios";
import { HubRestAPIClient } from "@standard-crypto/farcaster-js-hub-rest";

const axiosInstance = axios.create({
  headers: {
    "Content-Type": "application/json",
    "x-airstack-hubs": process.env.HUB_API_KEY,
  },
});

export const client = new HubRestAPIClient({
  axiosInstance,
  hubUrl: FARCASTER_HUB_URL,
});

interface ChannelResponse {
  result: {
    channel: {
      id: string;
      url: string;
    };
  };
}

export async function getChannelDetails(
  channel: string
): Promise<ChannelResponse | undefined> {
  try {
    const res = await fetch(
      `https://api.warpcast.com/v1/channel?channelId=${channel}`
    );
    if (res.ok) {
      const data = (await res.json()) as ChannelResponse;
      return data;
    }
  } catch (e) {
    return undefined;
  }
}

export async function getFidFromUsername(
  username: string
): Promise<string | undefined> {
  try {
    const res = await client.getUsernameProof(username);
    return res?.fid.toString();
  } catch (e) {
    return undefined;
  }
}
