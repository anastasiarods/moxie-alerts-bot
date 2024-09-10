//@ts-nocheck
/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable no-console */
import {
  createWalletClient,
  http,
  toHex,
  encodeAbiParameters,
  type EncodeAbiParametersReturnType,
  type Hex,
  type WalletClient,
  getContract,
  createPublicClient,
  type HDAccount,
} from "viem";
import { optimism } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";
import { ed25519 } from "@noble/curves/ed25519";
import readline from "readline";

/* This script creates a Farcaster signer for your bot. Input your Farcaster recovery phrase and FID.
MNEMONIC - To get your Farcaster recovery phrase, go to your Farcaster settings -> advanced -> recovery phrase.
FID - To get your Farcaster FID, go to your profile page -> 3 dots -> About -> FID.
*/

const CONTRACTS = {
  idRegistry: "0x00000000fcaf86937e41ba038b4fa40baa4b780a" as const,
  keyGateway: "0x00000000fc56947c7e7183f8ca4b62398caadf0b" as const,
  signedKeyRequestValidator:
    "0x00000000fc700472606ed4fa22623acf62c60553" as const,
};

const etherscanEndpoint =
  "https://optimism.blockscout.com/api?module=contract&action=getabi&address=";

const IdContract = {
  address: CONTRACTS.idRegistry,
  chain: optimism,
};
const KeyGatewayContract = {
  address: CONTRACTS.keyGateway,
  chain: optimism,
};

const SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN = {
  name: "Farcaster SignedKeyRequestValidator",
  version: "1",
  chainId: 10, // OP Mainnet
  verifyingContract: "0x00000000fc700472606ed4fa22623acf62c60553",
} as const;

const SIGNED_KEY_REQUEST_TYPE = [
  { name: "requestFid", type: "uint256" },
  { name: "key", type: "bytes" },
  { name: "deadline", type: "uint256" },
] as const;

export async function createDeveloperSigner(
  mnemonic: string,
  fid: string
): Promise<void> {
  const account = mnemonicToAccount(mnemonic);
  const walletClient = createWalletClient({
    account: account,
    chain: optimism,
    transport: http(),
  });
  const publicClient = createPublicClient({
    chain: optimism,
    transport: http(),
  });

  const idContractAbi = (await fetch(
    `${etherscanEndpoint}${CONTRACTS.idRegistry}`
  ).then((res) => res.json())) as { status: string; result: string };

  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = toHex(ed25519.getPublicKey(privateKey));

  const params = await getSignedMetadataParams(
    walletClient,
    account,
    Number(fid),
    account.address,
    publicKey
  );

  const keyGatewayContractAbi = (await fetch(
    `${etherscanEndpoint}${CONTRACTS.keyGateway}`
  ).then((res) => res.json())) as { status: string; result: string };

  const { request: signerAddRequest } = await publicClient.simulateContract({
    ...KeyGatewayContract,
    abi: JSON.parse(keyGatewayContractAbi.result),
    functionName: "add",
    args: [1, publicKey, 1, params], // keyType, key, metadataType, metadata
    account: account,
  });

  const signerAddTxHash = await walletClient.writeContract(signerAddRequest);
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  console.log(
    `Transaction written to OP Mainnet. Check txn status at https://optimistic.etherscan.io/tx/${signerAddTxHash}`
  );
  await publicClient.waitForTransactionReceipt({ hash: signerAddTxHash });
  console.log("Transaction Confirmed! Your signer is ready to use.");
  console.log(`Signer public key: ${publicKey}`);
  console.log(`Signer private key: ${toHex(privateKey)}`);
}

const SignedKeyRequestMetadataABI = {
  inputs: [
    {
      components: [
        {
          internalType: "uint256",
          name: "requestFid",
          type: "uint256",
        },
        {
          internalType: "address",
          name: "requestSigner",
          type: "address",
        },
        {
          internalType: "bytes",
          name: "signature",
          type: "bytes",
        },
        {
          internalType: "uint256",
          name: "deadline",
          type: "uint256",
        },
      ],
      internalType: "struct SignedKeyRequestValidator.SignedKeyRequestMetadata",
      name: "metadata",
      type: "tuple",
    },
  ],
  name: "encodeMetadata",
  outputs: [
    {
      internalType: "bytes",
      name: "",
      type: "bytes",
    },
  ],
  stateMutability: "pure",
  type: "function",
};

async function getSignedMetadataParams(
  walletClient: WalletClient,
  account: HDAccount,
  fid: number,
  address: Hex,
  signerPublicKey: Hex
): Promise<EncodeAbiParametersReturnType> {
  const deadline = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour from now

  // Sign a EIP-712 message using the account that holds the FID to authorize adding this signer to the key registry
  const signedMetadata = await walletClient.signTypedData({
    domain: SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
    types: {
      SignedKeyRequest: SIGNED_KEY_REQUEST_TYPE,
    },
    primaryType: "SignedKeyRequest",
    message: {
      requestFid: BigInt(fid),
      key: signerPublicKey,
      deadline: BigInt(deadline),
    },
    account: account,
  });

  return encodeAbiParameters(SignedKeyRequestMetadataABI.inputs, [
    {
      requestFid: BigInt(fid),
      requestSigner: address,
      signature: signedMetadata,
      deadline: BigInt(deadline),
    },
  ]);
}

// Add this function to get user input
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

// Modify the main function to be async and get user input
async function main() {
  const mnemonic = await askQuestion("Enter your Farcaster recovery phrase: ");
  const fid = await askQuestion("Enter your Farcaster FID: ");

  await createDeveloperSigner(mnemonic, fid);
}

main().catch(console.error);
