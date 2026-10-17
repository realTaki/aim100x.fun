// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Idols100x
/// @notice One OpenZeppelin ERC-721 token per LonelyFuns idol. Index is token id only.
///
/// Named NFT fields live on-chain. Vercel `/api/metadata/{tokenId}` composes
/// ERC-721 marketplace JSON from those fields. Images stay in private R2
/// (token id → media rows); do not persist image ids on-chain.
///
/// Fan entry points:
///   subscribe(tokenId) — LonelyUSD to TBA + 登记 membership + subscriberCount + 累计收账
///   pay(tokenId, amount) — LonelyUSD to TBA + 累计收账
///   buy(tokenId) — LonelyUSD to the current ERC-721 owner (not TBA) + 累计收账
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC6551Registry} from "./interfaces/IERC6551Registry.sol";

interface ITokenboundAccountProxy {
    function initialize(address implementation) external;
}

contract Idols100x is ERC721, Ownable {
    error InvalidRecipient();
    error NotOwnerOrApproved();
    error InvalidPrice();
    error TransferFailed();
    error NotForSale();
    error SoldOut();
    error MintCap();
    error InvalidAgent();

    event IdolMinted(uint256 indexed tokenId, address indexed to);
    event BaseURISet(string baseURI);
    /// @dev ERC-4906 — marketplaces refresh tokenURI JSON.
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
    event IdolFieldsSet(uint256 indexed tokenId);
    event AgentSet(address indexed owner, address indexed agent, AgentRole role);
    event AgentRemoved(address indexed owner, address indexed agent);
    /// @dev Plaza / service visibility (公开), not the 20 LUSD sale listing.
    event IdolPublic(uint256 indexed tokenId, bool isPublic);
    event FanSubscribed(address indexed fan, uint256 indexed tokenId);
    event Paid(address indexed payer, uint256 indexed tokenId, uint256 amount);
    event SalePriceSet(uint256 indexed tokenId, uint256 price);
    event IdolSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);

    uint256 public constant TARGET_CHAIN_ID = 10143;
    bytes32 public constant ERC6551_SALT = bytes32(0);
    /// @dev Canonical Tokenbound v3 Account Implementation (initialize after createAccount).
    address public constant TOKENBOUND_V3_IMPLEMENTATION =
        0x41C8f39463A868d3A88af00cd0fe7102F30E44eC;
    uint256 public constant DEFAULT_PRICE_USDC_ATOMIC = 1_000_000;
    /// @dev LonelyUSD 6 decimals. Paid `mint()` price and default listing.
    uint256 public constant MINT_PRICE_USDC_ATOMIC = 20_000_000;
    uint256 public constant DEFAULT_SALE_PRICE_USDC_ATOMIC = 20_000_000;
    uint256 public constant MAX_SUPPLY = 100;
    uint256 public constant MAX_MINTS_PER_ACCOUNT = 4;
    bytes4 private constant ERC4906_INTERFACE_ID = 0x49064906;

    IERC6551Registry public immutable erc6551Registry;
    address public immutable erc6551AccountImplementation;
    IERC20 public immutable usdc;

    string public baseURI;
    uint256 public nextTokenId = 1;
    mapping(address account => uint256) public mintsOf;

    enum AgentRole {
        None,
        Content,
        Full
    }

    struct AgentAuthorization {
        address agent;
        AgentRole role;
    }

    /// @notice One active Agent Account per NFT owner. The grant applies to every idol
    ///         currently owned by that address; ownership is resolved on each write.
    mapping(address ownerAddress => AgentAuthorization) public agentOf;

    mapping(uint256 tokenId => string) private _nameOf;
    mapping(uint256 tokenId => string) private _bioOf;
    mapping(uint256 tokenId => string) private _personalityOf;
    mapping(uint256 tokenId => string) private _lookOf;
    mapping(uint256 tokenId => string) private _voiceOf;
    mapping(uint256 tokenId => string) private _websiteOf;
    mapping(uint256 tokenId => string) private _twitterOf;
    /// @dev 欢迎词 — assistant line written into a new chat on subscribe.
    mapping(uint256 tokenId => string) private _welcomeOf;
    mapping(uint256 tokenId => string) private _scenesOf;
    mapping(uint256 tokenId => uint256) private _subscribePriceUsdcOf;
    mapping(uint256 tokenId => uint256) private _imageUnlockPriceUsdcOf;
    /// @dev Plaza / service visibility. Not the 20 LUSD `salePriceUsdc` listing.
    mapping(uint256 tokenId => bool) private _isPublic;
    /// @dev USDC 6 decimals. 0 = not for sale.
    mapping(uint256 tokenId => uint256) private _salePriceUsdcOf;

    /// @dev Fan wallet → idol token ids this wallet has subscribed to.
    mapping(address fan => uint256[]) private _subscribedTokenIds;
    /// @dev Idol token id → subscriber count (plaza sort, profile fan count).
    mapping(uint256 tokenId => uint256) private _subscriberCount;
    /// @dev Idol token id → lifetime USDC received (6 decimals), 累计收账.
    mapping(uint256 tokenId => uint256) private _receiptsUsdc;

    struct IdolContentWrite {
        string name;
        string bio;
        string personality;
        string look;
        string voice;
        string website;
        string twitter;
        string scenes;
    }

    struct IdolPricingWrite {
        uint256 subscribePriceUsdc;
        uint256 imageUnlockPriceUsdc;
    }

    struct IdolView {
        string name;
        string bio;
        string personality;
        string look;
        string voice;
        string website;
        string twitter;
        string scenes;
        uint256 subscribePriceUsdc;
        uint256 imageUnlockPriceUsdc;
        bool isPublic;
        uint256 subscriberCount;
        uint256 receiptsUsdc;
        uint256 salePriceUsdc;
    }

    constructor(
        address initialOwner,
        string memory baseURI_,
        address erc6551Registry_,
        address erc6551AccountImplementation_,
        address usdc_
    ) ERC721("idols100x", "100X") Ownable(initialOwner) {
        // `erc6551AccountImplementation_` is the Tokenbound v3 Account Proxy
        // (registry createAccount implementation argument).
        if (usdc_ == address(0)) revert InvalidRecipient();
        if (erc6551Registry_ == address(0) || erc6551AccountImplementation_ == address(0)) {
            revert InvalidRecipient();
        }
        baseURI = baseURI_;
        erc6551Registry = IERC6551Registry(erc6551Registry_);
        erc6551AccountImplementation = erc6551AccountImplementation_;
        usdc = IERC20(usdc_);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == ERC4906_INTERFACE_ID || super.supportsInterface(interfaceId);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function tokenBoundAccount(uint256 tokenId) public view returns (address) {
        _requireOwned(tokenId);
        return erc6551Registry.account(
            erc6551AccountImplementation,
            ERC6551_SALT,
            block.chainid,
            address(this),
            tokenId
        );
    }

    /// @notice Pay 20 LUSD, mint one idol to the caller. Max 4 per account, supply 100.
    ///         Hidden from plaza and not for sale until the owner sets those fields.
    function mint() external returns (uint256 tokenId) {
        address to = msg.sender;
        if (to == address(0)) revert InvalidRecipient();
        tokenId = nextTokenId;
        if (tokenId > MAX_SUPPLY) revert SoldOut();
        if (mintsOf[to] >= MAX_MINTS_PER_ACCOUNT) revert MintCap();

        _takeUsdcFromTo(to, address(this), MINT_PRICE_USDC_ATOMIC);

        unchecked {
            mintsOf[to] += 1;
            nextTokenId = tokenId + 1;
        }

        _subscribePriceUsdcOf[tokenId] = DEFAULT_PRICE_USDC_ATOMIC;
        _imageUnlockPriceUsdcOf[tokenId] = DEFAULT_PRICE_USDC_ATOMIC;
        _mint(to, tokenId);
        emit IdolMinted(tokenId, to);
        emit MetadataUpdate(tokenId);

        address tba = erc6551Registry.createAccount(
            erc6551AccountImplementation,
            ERC6551_SALT,
            block.chainid,
            address(this),
            tokenId
        );
        ITokenboundAccountProxy(tba).initialize(TOKENBOUND_V3_IMPLEMENTATION);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        baseURI = baseURI_;
        emit BaseURISet(baseURI_);
        emit BatchMetadataUpdate(0, type(uint256).max);
    }

    /// @notice Replace the caller's Agent Account and its idol-management role.
    ///         The caller is the NFT owner account whose present and future idols are managed.
    function setAgent(address agent, AgentRole role) external {
        if (agent == address(0) || role == AgentRole.None) revert InvalidAgent();
        agentOf[msg.sender] = AgentAuthorization({agent: agent, role: role});
        emit AgentSet(msg.sender, agent, role);
    }

    function removeAgent() external {
        address previous = agentOf[msg.sender].agent;
        if (previous == address(0)) revert InvalidAgent();
        delete agentOf[msg.sender];
        emit AgentRemoved(msg.sender, previous);
    }

    function setIdolContent(uint256 tokenId, IdolContentWrite calldata input) external {
        _requireContentManager(tokenId);
        _writeIdolContent(tokenId, input);
        emit IdolFieldsSet(tokenId);
        emit MetadataUpdate(tokenId);
    }

    /// @notice 欢迎词. Separate from scene `opening`. Additive — `idolOf` encoding is unchanged.
    function welcomeOf(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _welcomeOf[tokenId];
    }

    function setWelcome(uint256 tokenId, string calldata welcome) external {
        _requireContentManager(tokenId);
        _welcomeOf[tokenId] = welcome;
        emit IdolFieldsSet(tokenId);
        emit MetadataUpdate(tokenId);
    }

    function setIdolPricing(uint256 tokenId, IdolPricingWrite calldata input) external {
        _requireFullManager(tokenId);
        if (input.subscribePriceUsdc == 0 || input.imageUnlockPriceUsdc == 0) revert InvalidPrice();
        _subscribePriceUsdcOf[tokenId] = input.subscribePriceUsdc;
        _imageUnlockPriceUsdcOf[tokenId] = input.imageUnlockPriceUsdc;
        emit IdolFieldsSet(tokenId);
        emit MetadataUpdate(tokenId);
    }

    function idolOf(uint256 tokenId) external view returns (IdolView memory) {
        _requireOwned(tokenId);
        return IdolView({
            name: _nameOf[tokenId],
            bio: _bioOf[tokenId],
            personality: _personalityOf[tokenId],
            look: _lookOf[tokenId],
            voice: _voiceOf[tokenId],
            website: _websiteOf[tokenId],
            twitter: _twitterOf[tokenId],
            scenes: _scenesOf[tokenId],
            subscribePriceUsdc: _subscribePriceUsdcOf[tokenId],
            imageUnlockPriceUsdc: _imageUnlockPriceUsdcOf[tokenId],
            isPublic: _isPublic[tokenId],
            subscriberCount: _subscriberCount[tokenId],
            receiptsUsdc: _receiptsUsdc[tokenId],
            salePriceUsdc: _salePriceUsdcOf[tokenId]
        });
    }

    function salePriceUsdcOf(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _salePriceUsdcOf[tokenId];
    }

    function setSalePrice(uint256 tokenId, uint256 price) external {
        _requireFullManager(tokenId);
        _salePriceUsdcOf[tokenId] = price;
        emit SalePriceSet(tokenId, price);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Pay `salePriceUsdc` LonelyUSD to the current ERC-721 owner, then take the NFT.
    ///         Proceeds go to the seller — not the TBA (the buyer would reclaim them).
    ///         Credits 累计收账 so plaza accumulated pay includes the sale. Price clears to 0.
    function buy(uint256 tokenId) external {
        address seller = ownerOf(tokenId);
        uint256 price = _salePriceUsdcOf[tokenId];
        if (price == 0) revert NotForSale();
        address buyer = msg.sender;
        if (buyer == seller) revert InvalidRecipient();
        _takeUsdcFromTo(buyer, seller, price);
        _addReceipts(tokenId, price);
        emit IdolSold(tokenId, seller, buyer, price);
        emit SalePriceSet(tokenId, 0);
        _transfer(seller, buyer, tokenId);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Pull LonelyUSD held by this contract (primary-sale proceeds).
    function withdrawUsdc(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidPrice();
        (bool ok, bytes memory data) =
            address(usdc).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    /// @notice Plaza / service visibility (公开). Not the 20 LUSD sale listing.
    function publicOf(uint256 tokenId) public view returns (bool) {
        _requireOwned(tokenId);
        return _isPublic[tokenId];
    }

    function setPublic(uint256 tokenId, bool isPublic) external {
        _requireContentManager(tokenId);
        _writePublic(tokenId, isPublic);
    }

    /// @dev Live collection ABI names for `publicOf` / `setPublic`.
    function listedOf(uint256 tokenId) external view returns (bool) {
        return publicOf(tokenId);
    }

    function setListed(uint256 tokenId, bool isPublic) external {
        _requireContentManager(tokenId);
        _writePublic(tokenId, isPublic);
    }

    function subscriberCountOf(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _subscriberCount[tokenId];
    }

    function receiptsUsdcOf(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _receiptsUsdc[tokenId];
    }

    function subscribedIdsOf(address fan) external view returns (uint256[] memory) {
        return _subscribedTokenIds[fan];
    }

    function fanSubscribed(uint256 tokenId, address fan) public view returns (bool) {
        uint256[] storage ids = _subscribedTokenIds[fan];
        uint256 len = ids.length;
        for (uint256 i = 0; i < len; i++) {
            if (ids[i] == tokenId) return true;
        }
        return false;
    }

    /// @notice 登记. Pull subscribePrice LonelyUSD from msg.sender to the TBA.
    function subscribe(uint256 tokenId) external {
        _requireOwned(tokenId);
        address fan = msg.sender;
        if (fan == address(0)) revert InvalidRecipient();
        if (fanSubscribed(tokenId, fan)) return;
        uint256 price = _subscribePriceUsdcOf[tokenId];
        _takeUsdcToTba(tokenId, price);
        _addReceipts(tokenId, price);
        _subscribedTokenIds[fan].push(tokenId);
        unchecked {
            _subscriberCount[tokenId] += 1;
        }
        emit FanSubscribed(fan, tokenId);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Record a LonelyUSD payment. Pulls `amount` from msg.sender to the TBA.
    function pay(uint256 tokenId, uint256 amount) external {
        _requireOwned(tokenId);
        if (amount == 0) revert InvalidPrice();
        address payer = msg.sender;
        _takeUsdcToTba(tokenId, amount);
        _addReceipts(tokenId, amount);
        emit Paid(payer, tokenId, amount);
        emit MetadataUpdate(tokenId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0)) delete _salePriceUsdcOf[tokenId];
    }

    /// @dev NFT owner, or the Ownable owner while this contract still holds an unsold mint,
    ///      has Full authority. An owner's active Agent applies to all NFTs it currently owns.
    function _managerRole(uint256 tokenId) internal view returns (AgentRole) {
        address tokenOwner = ownerOf(tokenId);
        if (msg.sender == tokenOwner) return AgentRole.Full;
        if (tokenOwner == address(this) && msg.sender == owner()) return AgentRole.Full;
        AgentAuthorization memory authorization = agentOf[tokenOwner];
        if (authorization.agent == msg.sender) return authorization.role;
        return AgentRole.None;
    }

    function _requireContentManager(uint256 tokenId) internal view {
        if (_managerRole(tokenId) >= AgentRole.Content) return;
        revert NotOwnerOrApproved();
    }

    function _requireFullManager(uint256 tokenId) internal view {
        if (_managerRole(tokenId) == AgentRole.Full) return;
        revert NotOwnerOrApproved();
    }

    function _writeIdolContent(uint256 tokenId, IdolContentWrite memory input) internal {
        _nameOf[tokenId] = input.name;
        _bioOf[tokenId] = input.bio;
        _personalityOf[tokenId] = input.personality;
        _lookOf[tokenId] = input.look;
        _voiceOf[tokenId] = input.voice;
        _websiteOf[tokenId] = input.website;
        _twitterOf[tokenId] = input.twitter;
        _scenesOf[tokenId] = input.scenes;
    }

    function _writePublic(uint256 tokenId, bool isPublic) internal {
        _isPublic[tokenId] = isPublic;
        emit IdolPublic(tokenId, isPublic);
        emit MetadataUpdate(tokenId);
    }

    function _addReceipts(uint256 tokenId, uint256 amount) internal {
        unchecked {
            _receiptsUsdc[tokenId] += amount;
        }
    }

    function _takeUsdcToTba(uint256 tokenId, uint256 amount) internal {
        address tba = tokenBoundAccount(tokenId);
        _takeUsdcFromTo(msg.sender, tba, amount);
    }

    function _takeUsdcFromTo(address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = address(usdc).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
