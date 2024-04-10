import { ethers } from "https://cdn.skypack.dev/ethers@v5.7.2";

const STORAGE_NAMESPACE = "BAYC-storage";

const eventIface = new ethers.utils.Interface([
    "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
    "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
    "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export async function triggerHandler(context, data) {
    const parsedLog = eventIface.parseLog(data);

    switch (parsedLog.name) {
        case "Transfer":
            return await handleTransfer(parsedLog);
        case "Approval":
            return await handleApproval(parsedLog);
    }
}

async function handleTransfer(parsedLog) {
    const { from, to, tokenId } = parsedLog.args;
    const hexTokenId = tokenId.toHexString();
    const tokenKey = `token-${hexTokenId}`;

    // Fetch the token object fron KV store
    let token = await sbcore.storage.Load(STORAGE_NAMESPACE, tokenKey, null);
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

    await sbcore.storage.Store(STORAGE_NAMESPACE, tokenKey, token);
}

async function handleApproval(parsedLog) {
    const { owner, approved, tokenId } = parsedLog.args;
    const hexTokenId = tokenId.toHexString();
    const tokenKey = `token-${hexTokenId}`;

    // Fetch the token object fron KV store
    let token = await sbcore.storage.Load(STORAGE_NAMESPACE, tokenKey, null);
    if (token === null) {
        token = {
            owner: owner,
            previousOwner: null,
            approved: approved,
            tokenId: hexTokenId
        };
    } else {
        token.approved = approved;
    }

    await sbcore.storage.Store(STORAGE_NAMESPACE, tokenKey, token);
}
