const airstackEndpoint = "https://api.airstack.xyz/graphql";

const getFarcasterUserInfoQuery = `
query GetFarcasterUserInfoByAddress($address: Address!) {
  Socials(
    input: {filter: {userAssociatedAddresses: {_eq: $address}, dappName: {_eq: farcaster}}, blockchain: ethereum}
  ) {
    Social {
      profileName
      connectedAddresses {
        address
        blockchain
      }
    }
  }
}
`;

interface ConnectedAddress {
  address: string;
  blockchain: string;
}

interface FarcasterUserInfo {
  profileName: string;
  connectedAddresses: ConnectedAddress[];
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
  return data.data.Socials.Social[0] || null;
}
