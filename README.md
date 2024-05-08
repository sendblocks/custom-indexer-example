# SendBlocks Custom Indexer Example

In this sample repo we will demonstrate how to use the SendBlocks platform to quickly create and deploy advanced indexing logic without the need for a dedicated backend. If you are unfamiliar with the SendBlocks platform, it is recommended to start with the [documentation](https://sendblocks.readme.io/docs) before moving on.

More so, this guide will use the [sendblocks-cli](https://www.npmjs.com/package/sendblocks-cli) tool to deploy the wanted functionality to the SendBlocks platform. Kindly refer to the [documentation](https://github.com/sendblocks/sendblocks-cli) for more information on how to install and use the `sendblocks-cli` tool.

The deployed function will mirror the functionality of [this](https://github.com/dabit3/bored-ape-yacht-club-api-and-subgraph) subgraph, but with added flexibility and ease of use.

We will use the [Bored Ape Yacht Club (BAYC)](https://etherscan.io/address/0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D) contract as an example.

## Retrieving contract ABI

To interact with our contract we need to retrieve its ABI. You can find the ABI for the BAYC contract on [Etherscan](https://etherscan.io/address/0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D#code). To use any other contract, simply replace the address in the URL with the address of the contract desired.
Once you have the ABI, you can save it as a JSON file and use [format_abi.js](./abi/format_abi.js) to convert it into shorter format. This shorter format will be easier to use in your SendBlocks function.
When using the short ABI in your function code, you can easily choose only the information you're interested in.
For our example, we will need the `Transfer` and `Approval` events.

```javascript
const eventIface = new ethers.utils.Interface([
    "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
    "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
    "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);
```

## Data Sources

To build the indexing logic, we first need to understand where our data will be coming from. Subgraphs are built around listening to events emitted by smart contracts. They can also listen for calls to the contract, and new blocks, but this is not recommended for performance reasons.

We will listen for the `Transfer` and `Approve` events emitted by the BAYC contract. In the subgraph, this is defined in the `subgraph.yaml` file as follows:

```yaml
dataSources:
  - kind: ethereum/contract
    mapping:
      eventHandlers:
        - event: Transfer(indexed address,indexed address,indexed uint256)
          handler: handleTransferApe
```

Note that you will need to create an individual handler for each additional event you want to listen for.

In SendBlocks you can listen for events, calls, contract creation, block creation, and even changes to individual contract storage slots, all without sacrificing performance!
To listen for events emitted by the BAYC contract, we will include the following trigger definition in the [functions.yaml](src/functions.yaml) file:

```yaml
triggers:
  - type: TRIGGER_TYPE_ADDRESS
    address: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"
    locations:
      - log_emitter
```

This trigger will invoke the handler function that we will create shortly.

## Data Schema

Once we know how to ingest the data, we need to define a way to store it.

In the subgraph, this would be defined in the `schema.graphql` file:

```graphql
type Token {
  id: ID!
  owner: String!
  approved: String
  tokenId: BigInt!
}
```

In SendBlocks this is done by defining objects that will be stored in the function's builtin Key-Value (KV for short) store.

You can define the object as a TypeScript type:

```typescript
type Token = {
  owner: string;
  previousOwner: string;
  approved: string;
  tokenId: string;
}
```

You can then use it to save and load data for an appropriately-named namespace. Namespaces are accessible to all of the tenant's function handlers.

```typescript
let token: Token;
token = await sbcore.Load("my_namespace", "token");
sbcore.Store("my_namespace", "token", token);
```

## Handler Code

Now that we know what events to listen for and how to save the data, we're ready to create the SendBlocks function. We start by importing the `ethers` library and creating the interface for the `BToken` contract. This will allow us to parse the emitted events.

```javascript
import { ethers } from "https://cdn.skypack.dev/ethers@v5.7.2";

const eventIface = new ethers.utils.Interface([
    "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
    "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
    "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);
```

We then create the `triggerHandler` function that will be called when the `BToken` contract emits an event. This function will parse the events using the interface we created earlier and call the appropriate handler function. For now we will only handle the `Transfer` and `Approval` events.

```javascript
export async function triggerHandler(context, data) {
    const parsedLog = eventIface.parseLog(data);

    switch (parsedLog.name) {
        case "Transfer":
            return await handleTransfer(parsedLog);
        case "Approval":
            return await handleApproval(parsedLog);
    }
}
```

Lastly, we populate the handler functions with the indexing logic. Note that we are using the `sbcore.storage` object to interact with the builtin KV store. The full code example can be found in [sb-bayc.js](functions/sb-bayc.js). Below is an example of the `handleTransfer` function:

```javascript
async function handleTransfer(parsedLog) {
    const { from, to, tokenId } = parsedLog.args;
    const hexTokenId = tokenId.toHexString();
    const tokenKey = `token-${hexTokenId}`;

    // Fetch the token object from the KV store
    let token = await sbcore.storage.Load("BAYC-storage", tokenKey, null);
    if (token === null) {
        token = {
            owner: to,
            previousOwner: from,
            approved: null,
            tokenId: hexTokenId
        };
    } else {
        token.previousOwner = from;
        token.owner = to;
        token.approved = null;
    }

    await sbcore.storage.Store("BAYC-storage", tokenKey, token);
}
```

## Putting it all together

### Deploying your function

Your final `functions.yaml` file should look like this:

```yaml
webhooks:
  - example_webhook:
      url: https://example.com
      secret: "auth secret"

functions:
  - BoredApeYachtClub:
      chain_id: CHAIN_ETH_MAINNET
      code: functions/sb-bayc.js
      should_send_std_streams: true
      trigger:
        type: TRIGGER_TYPE_ADDRESS
        address: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"
        locations:
          - log_emitter
      webhook: example_webhook
```

Running `npx sendblocks-cli deploy` will deploy the function to the SendBlocks platform. Take note of the `function_id`, but don't worry - if you forget it, you can always retrieve it by running `npx sendblocks-cli preview`.

### Ensuring your KV is populated

To make sure that your KV store's namespace is populated before actual events occur, you can use our [replay](https://sendblocks.readme.io/reference/replay_blocks_api_v1_functions_replay_blocks_post) functionality.

For this example, head to [the events tab for the contract on Etherscan](https://etherscan.io/address/0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D#events) and select the block number for the latest `Transfer` event. You can then use the SendBlocks API reference link above directly.

*You can retrieve the JWT bearer token from the [.auth] file that was generated when you logged in with the `sendblocks-cli` tool.*

### Accessing the KV storage

You can check the data in your `BAYC-storage` namespace directly via the [SendBlocks API](https://sendblocks.readme.io/reference/get_namespace_storage_api_v1_storage_namespaces__namespace_id__values_get).

Alternatively, you can use the SendBlocks API to [create a public share](https://sendblocks.readme.io/reference/create_public_share_api_v1_storage_namespaces__namespace_id__shares_post), which will enable you and your users to access the data without authenticating.

Congratulations! You have now entered a new era of blockchain development 🚀
