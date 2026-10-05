// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Idols100x} from "../src/idols100x.sol";
import {MockERC6551Registry, MockTokenboundAccount} from "./MockERC6551Registry.sol";

contract ReceiverOk {
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC721Received.selector;
    }
}

contract ReceiverBad {}

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract Idols100xTest is Test {
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
    event FanSubscribed(address indexed fan, uint256 indexed tokenId);
    event Paid(address indexed payer, uint256 indexed tokenId, uint256 amount);

    uint256 internal constant SALE_20 = 20_000_000;
    address internal constant CUSTODIAN = 0xE541Ba52E2Eff4fEc12441C77F73352d885e183A;

    Idols100x internal nft;
    MockERC6551Registry internal registry;
    MockUSDC internal usdc;
    address internal admin = address(0xA11CE);
    address internal alice = address(0xB0B);
    address internal bob = address(0xB0B2);
    address internal aliceAgent = address(0xA6E17);
    address internal bobAgent = address(0xB6E17);
    address internal accountImpl = address(0xACC);

    function setUp() public {
        registry = new MockERC6551Registry();
        usdc = new MockUSDC();
        nft = new Idols100x(
            admin,
            "https://lonelyfuns.vercel.app/api/metadata/",
            address(registry),
            accountImpl,
            address(usdc)
        );
        usdc.mint(admin, 400_000_000);
        usdc.mint(alice, 100_000_000);
        usdc.mint(bob, 100_000_000);
        vm.prank(admin);
        usdc.approve(address(nft), type(uint256).max);
        vm.prank(alice);
        usdc.approve(address(nft), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(nft), type(uint256).max);
    }

    function _mintTo(address who) internal returns (uint256 id) {
        vm.prank(who);
        id = nft.mint();
    }

    function _mint() internal returns (uint256 id) {
        id = _mintTo(admin);
    }

    function _listForSale(uint256 id, uint256 price) internal {
        vm.prank(nft.ownerOf(id));
        nft.setSalePrice(id, price);
    }

    function _takeFromMint(address buyer) internal returns (uint256 id) {
        id = _mint();
        _listForSale(id, SALE_20);
        vm.prank(buyer);
        nft.buy(id);
    }

    function _write(string memory n, string memory scenes) internal pure returns (Idols100x.IdolContentWrite memory) {
        return Idols100x.IdolContentWrite({
            name: n,
            bio: "bio",
            personality: "persona",
            look: "look",
            voice: "eve",
            website: "",
            twitter: "",
            scenes: scenes
        });
    }

    function _pricing(uint256 subscribePrice, uint256 imageUnlockPrice)
        internal
        pure
        returns (Idols100x.IdolPricingWrite memory)
    {
        return Idols100x.IdolPricingWrite({subscribePriceUsdc: subscribePrice, imageUnlockPriceUsdc: imageUnlockPrice});
    }

    function test_metadataAndChainAssumptions() public view {
        assertEq(nft.name(), "idols100x");
        assertEq(nft.symbol(), "100X");
        assertEq(nft.TARGET_CHAIN_ID(), 10143);
        assertEq(nft.owner(), admin);
        assertEq(nft.nextTokenId(), 1);
        assertEq(address(nft.usdc()), address(usdc));
        assertEq(nft.DEFAULT_SALE_PRICE_USDC_ATOMIC(), SALE_20);
        assertEq(nft.MINT_PRICE_USDC_ATOMIC(), SALE_20);
        assertEq(nft.MAX_SUPPLY(), 100);
        assertEq(nft.MAX_MINTS_PER_ACCOUNT(), 4);
        assertTrue(nft.supportsInterface(0x80ac58cd));
        assertTrue(nft.supportsInterface(0x5b5e139f));
        assertTrue(nft.supportsInterface(0x01ffc9a7));
        assertTrue(nft.supportsInterface(0x49064906));
        assertFalse(nft.supportsInterface(0xffffffff));
    }

    function test_mintIsSequentialTokenIdOnly() public {
        uint256 adminBefore = usdc.balanceOf(admin);
        uint256 contractBefore = usdc.balanceOf(address(nft));
        uint256 id = _mint();

        assertEq(id, 1);
        assertEq(nft.ownerOf(1), admin);
        assertTrue(nft.ownerOf(1) != address(nft));
        assertTrue(nft.ownerOf(1) != CUSTODIAN);
        assertEq(nft.balanceOf(admin), 1);
        assertEq(nft.mintsOf(admin), 1);
        assertEq(nft.tokenURI(1), "https://lonelyfuns.vercel.app/api/metadata/1");
        address tba = nft.tokenBoundAccount(1);
        assertTrue(tba != address(0));
        assertEq(MockTokenboundAccount(tba).implementation(), nft.TOKENBOUND_V3_IMPLEMENTATION());
        Idols100x.IdolView memory view_ = nft.idolOf(1);
        assertEq(view_.subscribePriceUsdc, 1_000_000);
        assertEq(view_.imageUnlockPriceUsdc, 1_000_000);
        assertEq(view_.name, "");
        assertEq(view_.website, "");
        assertEq(view_.twitter, "");
        assertFalse(view_.isPublic);
        assertEq(view_.subscriberCount, 0);
        assertEq(view_.receiptsUsdc, 0);
        assertEq(view_.salePriceUsdc, 0);
        assertEq(usdc.balanceOf(admin), adminBefore - SALE_20);
        assertEq(usdc.balanceOf(address(nft)), contractBefore + SALE_20);
    }

    function test_directSubscribePullsUsdcAndRecordsFan() public {
        uint256 id = _mint();
        address tba = nft.tokenBoundAccount(id);

        vm.prank(alice);
        nft.subscribe(id);

        assertTrue(nft.fanSubscribed(id, alice));
        uint256[] memory ids = nft.subscribedIdsOf(alice);
        assertEq(ids.length, 1);
        assertEq(ids[0], id);
        assertEq(nft.subscriberCountOf(id), 1);
        assertEq(nft.receiptsUsdcOf(id), 1_000_000);
        assertEq(usdc.balanceOf(tba), 1_000_000);
        assertEq(nft.idolOf(id).receiptsUsdc, 1_000_000);

        vm.prank(alice);
        nft.subscribe(id);
        assertEq(nft.subscribedIdsOf(alice).length, 1);
        assertEq(nft.subscriberCountOf(id), 1);
        assertEq(nft.receiptsUsdcOf(id), 1_000_000);

        vm.prank(bob);
        nft.subscribe(id);
        assertEq(nft.subscriberCountOf(id), 2);
        assertEq(nft.subscribedIdsOf(bob).length, 1);
        assertEq(nft.receiptsUsdcOf(id), 2_000_000);
        assertFalse(nft.fanSubscribed(id, address(0xDEAD)));
    }

    function test_directPayAddsReceipts() public {
        uint256 id = _mint();
        address tba = nft.tokenBoundAccount(id);

        vm.prank(alice);
        nft.pay(id, 500_000);
        assertEq(nft.receiptsUsdcOf(id), 500_000);
        assertEq(usdc.balanceOf(tba), 500_000);
        assertEq(nft.subscriberCountOf(id), 0);
    }

    function test_anyoneCanMintPayingLusd() public {
        uint256 id = _mintTo(alice);
        assertEq(id, 1);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.mintsOf(alice), 1);
        assertEq(usdc.balanceOf(address(nft)), SALE_20);
    }

    function test_mintCapPerAccount() public {
        for (uint256 i = 0; i < 4; i++) {
            _mintTo(alice);
        }
        assertEq(nft.mintsOf(alice), 4);
        assertEq(nft.nextTokenId(), 5);
        vm.prank(alice);
        vm.expectRevert(Idols100x.MintCap.selector);
        nft.mint();
        uint256 bobId = _mintTo(bob);
        assertEq(bobId, 5);
        assertEq(nft.ownerOf(5), bob);
    }

    function test_maxSupply100() public {
        for (uint256 i = 1; i <= 100; i++) {
            address user = address(uint160(10_000 + i));
            usdc.mint(user, SALE_20);
            vm.startPrank(user);
            usdc.approve(address(nft), SALE_20);
            uint256 id = nft.mint();
            vm.stopPrank();
            assertEq(id, i);
        }
        assertEq(nft.nextTokenId(), 101);
        vm.prank(alice);
        vm.expectRevert(Idols100x.SoldOut.selector);
        nft.mint();
    }

    function test_transferKeepsTokenIdAndFields() public {
        uint256 id = _takeFromMint(bob);
        vm.prank(bob);
        nft.setIdolContent(id, _write("Kira", "[{\"id\":\"locker\"}]"));

        ReceiverOk ok = new ReceiverOk();
        vm.prank(bob);
        nft.transferFrom(bob, address(ok), id);
        assertEq(nft.ownerOf(id), address(ok));
        assertEq(nft.idolOf(id).name, "Kira");
        assertEq(nft.tokenURI(id), "https://lonelyfuns.vercel.app/api/metadata/1");

        ReceiverBad bad = new ReceiverBad();
        vm.prank(address(ok));
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(bad))
        );
        nft.safeTransferFrom(address(ok), address(bad), id);
    }

    function test_setWelcomeIsAdditiveNamedField() public {
        uint256 id = _mint();
        vm.prank(admin);
        nft.setWelcome(id, unicode"感谢你订阅我");
        assertEq(nft.welcomeOf(id), unicode"感谢你订阅我");
        Idols100x.IdolView memory view_ = nft.idolOf(id);
        assertEq(view_.name, "");
        assertEq(view_.scenes, "");
        vm.prank(alice);
        vm.expectRevert(Idols100x.NotOwnerOrApproved.selector);
        nft.setWelcome(id, "nope");
    }

    function test_setIdolContentNamedNotBlob() public {
        uint256 id = _mint();
        vm.prank(admin);
        nft.setIdolContent(id, _write("Natalie", "[{\"id\":\"late-night\"}]"));
        vm.prank(admin);
        nft.setIdolPricing(id, _pricing(1_000_000, 500_000));
        Idols100x.IdolView memory view_ = nft.idolOf(id);
        assertEq(view_.name, "Natalie");
        assertEq(view_.bio, "bio");
        assertEq(view_.personality, "persona");
        assertEq(view_.scenes, "[{\"id\":\"late-night\"}]");
        assertEq(view_.website, "");
        assertEq(view_.twitter, "");
        assertEq(nft.welcomeOf(id), "");
        assertEq(view_.imageUnlockPriceUsdc, 500_000);
        vm.prank(alice);
        vm.expectRevert(Idols100x.NotOwnerOrApproved.selector);
        nft.setIdolContent(id, _write("Nope", "[]"));

        _listForSale(id, SALE_20);
        vm.prank(alice);
        nft.buy(id);
        vm.prank(admin);
        vm.expectRevert(Idols100x.NotOwnerOrApproved.selector);
        nft.setIdolContent(id, _write("Nope", "[]"));
        vm.prank(alice);
        nft.setIdolContent(id, _write("Natalie2", "[]"));
        assertEq(nft.idolOf(id).name, "Natalie2");
    }

    function test_zeroPriceReverts() public {
        uint256 id = _mint();
        vm.prank(admin);
        vm.expectRevert(Idols100x.InvalidPrice.selector);
        nft.setIdolPricing(id, _pricing(0, 500_000));
    }

    function test_approveOperator() public {
        uint256 id = _takeFromMint(alice);
        vm.prank(alice);
        nft.approve(bob, id);
        vm.prank(bob);
        nft.transferFrom(alice, bob, id);
        assertEq(nft.ownerOf(id), bob);
    }

    function test_publicDefaultsFalseAndOwnerSets() public {
        uint256 id = _mint();
        assertFalse(nft.publicOf(id));
        assertFalse(nft.listedOf(id));
        vm.prank(admin);
        nft.setPublic(id, true);
        assertTrue(nft.publicOf(id));
        assertTrue(nft.listedOf(id));
        vm.prank(alice);
        vm.expectRevert(Idols100x.NotOwnerOrApproved.selector);
        nft.setPublic(id, false);
        vm.prank(admin);
        nft.setListed(id, false);
        assertFalse(nft.publicOf(id));
    }

    function test_setBaseURIEmitsBatchMetadataUpdate() public {
        _mint();
        vm.prank(admin);
        vm.expectEmit(true, true, true, true, address(nft));
        emit BatchMetadataUpdate(0, type(uint256).max);
        nft.setBaseURI("https://lonelyfuns.vercel.app/api/metadata/");
        assertEq(nft.tokenURI(1), "https://lonelyfuns.vercel.app/api/metadata/1");
    }

    function test_setIdolContentEmitsMetadataUpdate() public {
        uint256 id = _mint();
        vm.prank(admin);
        vm.expectEmit(true, true, true, true, address(nft));
        emit MetadataUpdate(id);
        nft.setIdolContent(id, _write("N", "[]"));
    }

    function test_optionalWebsiteAndTwitterEmptyAllowed() public {
        uint256 id = _mint();
        Idols100x.IdolContentWrite memory input = _write("Natalie", "[]");
        input.website = "https://natalie.example";
        input.twitter = "https://x.com/natalie";
        vm.prank(admin);
        nft.setIdolContent(id, input);
        Idols100x.IdolView memory filled = nft.idolOf(id);
        assertEq(filled.website, "https://natalie.example");
        assertEq(filled.twitter, "https://x.com/natalie");

        input.website = "";
        input.twitter = "";
        vm.prank(admin);
        nft.setIdolContent(id, input);
        Idols100x.IdolView memory cleared = nft.idolOf(id);
        assertEq(cleared.website, "");
        assertEq(cleared.twitter, "");
        assertEq(cleared.name, "Natalie");
    }

    function test_contentAgentManagesAllCurrentAndFutureOwnerIdols() public {
        uint256 first = _mintTo(alice);

        vm.prank(alice);
        nft.setAgent(aliceAgent, Idols100x.AgentRole.Content);

        (address agent, Idols100x.AgentRole role) = nft.agentOf(alice);
        assertEq(agent, aliceAgent);
        assertEq(uint8(role), uint8(Idols100x.AgentRole.Content));

        vm.prank(aliceAgent);
        nft.setIdolContent(first, _write("First", "[]"));
        vm.prank(aliceAgent);
        nft.setPublic(first, true);
        assertEq(nft.idolOf(first).name, "First");
        assertTrue(nft.publicOf(first));

        uint256 second = _mintTo(alice);
        vm.prank(aliceAgent);
        nft.setIdolContent(second, _write("Second", "[]"));
        assertEq(nft.idolOf(second).name, "Second");

        vm.prank(aliceAgent);
        vm.expectRevert(Idols100x.NotOwnerOrApproved.selector);
        nft.setIdolPricing(first, _pricing(2_000_000, 3_000_000));
        vm.prank(aliceAgent);
        vm.expectRevert(Idols100x.NotOwnerOrApproved.selector);
        nft.setSalePrice(first, SALE_20);
    }

    function test_fullAgentCanManageContentAndPrices() public {
        uint256 id = _mintTo(alice);
        vm.prank(alice);
        nft.setAgent(aliceAgent, Idols100x.AgentRole.Full);

        vm.prank(aliceAgent);
        nft.setIdolContent(id, _write("Agent Managed", "[]"));
        vm.prank(aliceAgent);
        nft.setIdolPricing(id, _pricing(2_000_000, 3_000_000));
        vm.prank(aliceAgent);
        nft.setSalePrice(id, SALE_20);

        Idols100x.IdolView memory view_ = nft.idolOf(id);
        assertEq(view_.name, "Agent Managed");
        assertEq(view_.subscribePriceUsdc, 2_000_000);
        assertEq(view_.imageUnlockPriceUsdc, 3_000_000);
        assertEq(view_.salePriceUsdc, SALE_20);
    }

    function test_ownerCanReplaceAndRemoveAgent() public {
        uint256 id = _mintTo(alice);
        vm.prank(alice);
        nft.setAgent(aliceAgent, Idols100x.AgentRole.Content);
        vm.prank(alice);
        nft.setAgent(bobAgent, Idols100x.AgentRole.Full);

        vm.prank(aliceAgent);
        vm.expectRevert(Idols100x.NotOwnerOrApproved.selector);
        nft.setIdolContent(id, _write("Old", "[]"));
        vm.prank(bobAgent);
        nft.setIdolContent(id, _write("New", "[]"));
        assertEq(nft.idolOf(id).name, "New");

        vm.prank(alice);
        nft.removeAgent();
        (address agent, Idols100x.AgentRole role) = nft.agentOf(alice);
        assertEq(agent, address(0));
        assertEq(uint8(role), uint8(Idols100x.AgentRole.None));

        vm.prank(bobAgent);
        vm.expectRevert(Idols100x.NotOwnerOrApproved.selector);
        nft.setIdolContent(id, _write("Revoked", "[]"));
    }

    function test_agentAuthorityFollowsCurrentNftOwner() public {
        uint256 id = _mintTo(alice);
        vm.prank(alice);
        nft.setAgent(aliceAgent, Idols100x.AgentRole.Content);

        vm.prank(alice);
        nft.transferFrom(alice, bob, id);

        vm.prank(aliceAgent);
        vm.expectRevert(Idols100x.NotOwnerOrApproved.selector);
        nft.setIdolContent(id, _write("Old owner", "[]"));

        vm.prank(bob);
        nft.setAgent(bobAgent, Idols100x.AgentRole.Content);
        vm.prank(bobAgent);
        nft.setIdolContent(id, _write("New owner", "[]"));
        assertEq(nft.idolOf(id).name, "New owner");
    }

    function test_invalidAgentChangesRevert() public {
        vm.prank(alice);
        vm.expectRevert(Idols100x.InvalidAgent.selector);
        nft.setAgent(address(0), Idols100x.AgentRole.Content);

        vm.prank(alice);
        vm.expectRevert(Idols100x.InvalidAgent.selector);
        nft.setAgent(aliceAgent, Idols100x.AgentRole.None);

        vm.prank(alice);
        vm.expectRevert(Idols100x.InvalidAgent.selector);
        nft.removeAgent();
    }

    function test_salePriceZeroMeansNotForSale() public {
        uint256 id = _mint();
        vm.prank(bob);
        vm.expectRevert(Idols100x.NotForSale.selector);
        nft.buy(id);
        vm.prank(admin);
        nft.setSalePrice(id, 0);
        assertEq(nft.salePriceUsdcOf(id), 0);
        vm.prank(bob);
        vm.expectRevert(Idols100x.NotForSale.selector);
        nft.buy(id);
    }

    function test_onlyOwnerSetsSalePrice() public {
        uint256 id = _mint();
        vm.prank(bob);
        vm.expectRevert(Idols100x.NotOwnerOrApproved.selector);
        nft.setSalePrice(id, 2_000_000);
        vm.prank(admin);
        nft.setSalePrice(id, 2_000_000);
        assertEq(nft.salePriceUsdcOf(id), 2_000_000);
        assertEq(nft.idolOf(id).salePriceUsdc, 2_000_000);
    }

    function test_buyFromOwnerPaysOwnerClearsPriceAndTransfers() public {
        uint256 id = _mint();
        _listForSale(id, SALE_20);
        uint256 adminBefore = usdc.balanceOf(admin);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(bob);
        nft.buy(id);

        assertEq(nft.ownerOf(id), bob);
        assertEq(nft.salePriceUsdcOf(id), 0);
        assertEq(nft.idolOf(id).salePriceUsdc, 0);
        assertEq(nft.receiptsUsdcOf(id), SALE_20);
        assertEq(nft.idolOf(id).receiptsUsdc, SALE_20);
        assertEq(usdc.balanceOf(admin), adminBefore + SALE_20);
        assertEq(usdc.balanceOf(bob), bobBefore - SALE_20);
        assertEq(usdc.balanceOf(nft.tokenBoundAccount(id)), 0);

        vm.prank(alice);
        vm.expectRevert(Idols100x.NotForSale.selector);
        nft.buy(id);

        vm.prank(alice);
        nft.subscribe(id);
        assertEq(nft.receiptsUsdcOf(id), SALE_20 + 1_000_000);
        assertEq(usdc.balanceOf(nft.tokenBoundAccount(id)), 1_000_000);
    }

    function test_secondaryBuyPaysPerson() public {
        uint256 id = _takeFromMint(alice);
        vm.prank(alice);
        nft.setSalePrice(id, 2_000_000);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(bob);
        nft.buy(id);

        assertEq(nft.ownerOf(id), bob);
        assertEq(nft.salePriceUsdcOf(id), 0);
        assertEq(nft.receiptsUsdcOf(id), SALE_20 + 2_000_000);
        assertEq(usdc.balanceOf(alice), aliceBefore + 2_000_000);
        assertEq(usdc.balanceOf(bob), bobBefore - 2_000_000);
        assertEq(usdc.balanceOf(nft.tokenBoundAccount(id)), 0);
    }

    function test_ownerCannotBuyOwnListing() public {
        uint256 id = _takeFromMint(alice);
        vm.prank(alice);
        nft.setSalePrice(id, 1_000_000);
        vm.prank(alice);
        vm.expectRevert(Idols100x.InvalidRecipient.selector);
        nft.buy(id);
    }

    function test_regularTransferClearsSalePrice() public {
        uint256 id = _takeFromMint(alice);
        vm.prank(alice);
        nft.setSalePrice(id, 3_000_000);
        vm.prank(alice);
        nft.transferFrom(alice, bob, id);
        assertEq(nft.ownerOf(id), bob);
        assertEq(nft.salePriceUsdcOf(id), 0);
    }

    function test_withdrawUsdcOnlyOwner() public {
        _mintTo(alice);
        assertEq(usdc.balanceOf(address(nft)), SALE_20);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        nft.withdrawUsdc(alice, SALE_20);

        uint256 adminBefore = usdc.balanceOf(admin);
        vm.prank(admin);
        nft.withdrawUsdc(admin, SALE_20);
        assertEq(usdc.balanceOf(address(nft)), 0);
        assertEq(usdc.balanceOf(admin), adminBefore + SALE_20);
    }
}
