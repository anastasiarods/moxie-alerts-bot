// Add these cache-related constants and interfaces
const MAX_CACHE_SIZE = 50;
const CACHE_TTL = 3600000; // 1 hour in milliseconds

interface CacheEntry {
  data: FarcasterUserInfo | null;
  timestamp: number;
}

// Add this cache object after the existing constants
const cache: { [key: string]: CacheEntry } = {};

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

// Add this function to handle cache operations
function handleCache(
  key: string,
  operation: "get" | "set",
  data?: FarcasterUserInfo | null
): FarcasterUserInfo | null | undefined {
  const now = Date.now();

  if (operation === "get") {
    const cacheEntry = cache[key];
    if (cacheEntry && now - cacheEntry.timestamp < CACHE_TTL) {
      return cacheEntry.data;
    }
    return undefined;
  } else if (operation === "set") {
    // If cache is full, remove all entries
    if (Object.keys(cache).length >= MAX_CACHE_SIZE) {
      for (const cacheKey in cache) {
        delete cache[cacheKey];
      }
    }
    cache[key] = { data: data ?? null, timestamp: now };
  }
}

export async function getFarcasterUserInfoByAddress(
  address: string
): Promise<FarcasterUserInfo | null> {
  const cacheKey = address.toLowerCase();

  // Check cache first
  const cachedResult = handleCache(cacheKey, "get");

  console.log("cachedResult", cachedResult);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

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
    handleCache(cacheKey, "set", null);
    return null;
  }

  const result =
    userInfo.filter((u) => u.profileName !== null && u.profileName !== "")[0] ||
    null;

  // Cache the result
  handleCache(cacheKey, "set", result);

  return result;
}
