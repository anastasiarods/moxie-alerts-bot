const airstackEndpoint = "https://api.airstack.xyz/graphql";

const getFarcasterUserInfoQuery = `
query GetFarcasterUserInfoByAddress($address: Address!) {
  Socials(
    input: {filter: {userAssociatedAddresses: {_eq: $address}, dappName: {_eq: farcaster}}, blockchain: ethereum}
  ) {
    Social {
      profileName
      userId
    }
  }
}
`;

interface FarcasterUserInfo {
  profileName: string;
  userId: string;
}

interface AirstackResponse {
  data: {
    Socials: {
      Social: FarcasterUserInfo[];
    };
  };
}

export async function getFarcasterUserInfoByAddress(
  address: string
): Promise<FarcasterUserInfo | null> {
  const response = await fetch(airstackEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.AIRSTACK_API_KEY || "",
    },
    body: JSON.stringify({
      query: getFarcasterUserInfoQuery,
      variables: { address: address.toLowerCase() },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = (await response.json()) as AirstackResponse;

  const userInfo = data.data.Socials.Social;

  if (!userInfo) {
    return null;
  }

  return userInfo.filter(
    (u) => u.profileName !== null && u.profileName !== ""
  )[0] || null;
}
