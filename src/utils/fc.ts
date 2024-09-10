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
