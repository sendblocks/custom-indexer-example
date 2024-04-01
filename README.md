# SendBlocks Subgraph Workshop

In this repo we will demonstrate how to use the SendBlocks platform to quickly create and deploy advanced indexing logic without the need for a dedicated backend. If you are unfamiliar with the SendBlocks platform, it is recommended to start with the [documentation](https://sendblocks.readme.io/docs/the-basics) before moving on.

The deployed function will mirror the functionality of [this](https://github.com/dabit3/bored-ape-yacht-club-api-and-subgraph) subgraph but with added flexibility and ease of use.

We will use the [Bored Ape Yacht Club (BAYC)](https://etherscan.io/address/0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D) contract as an example.

## Data Sources

To build the indexing logic we need to first understand where our data will be coming from. Subgraphs are built around listening to events emitted by smart contracts, they can also listen for calls to the contract and new blocks but this is not recommended for performance reasons.

In SendBlocks you can listen for events, calls, contract creation, block creation, and even changes to individual contract storage slots. All without sacrificing performance! 

We will listen for the `Transfer` and `Approve` events emitted by the BAYC contract. This is expressed in SendBlocks by setting an address trigger on the contract with a `log_emitter` location. Your final `functions.yaml` file should, therefore, contain this snippet:

```yaml
trigger:
  type: TRIGGER_TYPE_ADDRESS
  address: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"
  locations:
    - log_emitter
```

For subgraphs, the event handler is defined as follows in the `subgraph.yaml` file. Note that you have to create a handler for each additional event you want to listen for. This is not the case in SendBlocks, where you can listen for multiple events in a single function. The mapping described is represented in the `subgraph.yaml` file as follows:

```yaml
dataSources:
  - kind: ethereum/contrac
    mapping:
      eventHandlers:
        - event: Transfer(indexed address,indexed address,indexed uint256)
          handler: handleTransferApe
```

## Data Schema

Once we know how to ingest data, we need to define a way to store it. 

In the subgraph, this would be defined in the `schema.graphql` file:

```graphql
type Token {
  id: ID!
  owner: String!
  approved: String
  tokenId: BigInt!
}
```

In SendBlocks this is done by defining objects that will be stored in the function's builtin Key-Value (KV for short) store. You can define the object as a TypeScript type and then use it to save and load data as follows:

```typescript
type Token = {
  owner: string;
  previousOwner: string;
  approved: string;
  tokenId: string;
}
```

## Handler Code

Now that we know what events to listen for and how to save the data, we can create the SendBlocks function. We start by importing `ethers` and creating the interface for the `BToken` contract. This will allow us to parse the emitted events. 

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
export function triggerHandler(context, data) {
    const parsedLog = eventIface.parseLog(data);

    switch (parsedLog.name) {
        case "Transfer":
            handleTransfer(parsedLog);
            break;
        case "Approval":
            handleApproval(parsedLog);
            break;
    }
}
```

Lastly, we populate the handler functions with the indexing logic. Note that we are using the `sbcore.storage` object to interact with the builtin KV store. Full code can be found at `sb-bayc.js`. Below is an example of the `handleTransfer` function:

```javascript
async function handleTransfer(parsedLog) {
    const { from, to, tokenId } = parsedLog.args;
    const hexTokenId = tokenId.toHexString();
    const tokenKey = `token-${hexTokenId}`;

    // Fetch the token object fron KV store
    let token = await sbcore.storage.Load(tokenKey, null);
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

    await sbcore.storage.Store(tokenKey, token);
}
```

## Putting it all together

Your final `functions.yaml` file should look like this:

```yaml
webhooks:
  - example_webhook:
      url: https://example.com
      secret: "auth secret"

functions:
  - BoredApeYachtClub:
      chain_id: CHAIN_ETH_MAINNET
      code: sb-bayc.js
      should_send_std_streams: true
      trigger:
        type: TRIGGER_TYPE_ADDRESS
        address: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"
        locations:
          - log_emitter
      webhook: example_webhook
```

Running `sb-cli deploy` will deploy the function to the SendBlocks platform. 

Congratulations! You entering a new era of blockchain development 🚀
