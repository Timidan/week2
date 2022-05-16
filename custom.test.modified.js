// [assignment] please copy the entire modified custom.test.js here
const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const {
  transaction,
  registerAndTransact,
  prepareTransaction,
  buildMerkleTree,
} = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(
  process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05',
)
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(
  process.env.MAXIMUM_DEPOSIT_AMOUNT || '1',
)

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy(
      'PermittableToken',
      'Wrapped ETH',
      'WETH',
      18,
      l1ChainId,
    )
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
    // [assignment] complete code here
    //from full_test.js..load the fixture
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
    //generate alice's keypair
    const aliceKp = new Keypair()
    const aliceDpAmount = utils.parseEther('0.1')
    const aliceDpUTXO = new Utxo({ amount: aliceDpAmount, keypair: aliceKp })
    //buld tx data
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [aliceDpUTXO],
    })
    //encode onchain bridge data
    const onchainBridgeData = encodeDataForBridge({ proof: args, extData })
    //encode bridge tx
    const onchainBridgeTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      aliceDpUTXO.amount,
      onchainBridgeData,
    )

    await token.transfer(omniBridge.address, aliceDpAmount)
    const transferTX = await token.populateTransaction.transfer(
      tornadoPool.address,
      aliceDpAmount,
    )

    await omniBridge.execute([
      { who: token.address, callData: transferTX.data },
      { who: tornadoPool.address, callData: onchainBridgeTx.data },
    ])

    //withdraw 0.08eth
    const aliceWithdrawAmount = utils.parseEther('0.08')
    const recipient = '0xDeaD00000000000000000000000000000000BEEf'
    const aliceUTXO = new Utxo({
      amount: aliceDpAmount.sub(aliceWithdrawAmount),
      keypair: aliceKp,
    })
    await transaction({
      tornadoPool,
      inputs: [aliceDpUTXO],
      outputs: [aliceUTXO],
      recipient: recipient,
      isL1Withdrawal: false,
    })

    const recipientBalance = await token.balanceOf(recipient)
    expect(recipientBalance).to.be.equal(aliceWithdrawAmount)
    const omniBridgeBalance = await token.balanceOf(omniBridge.address)
    expect(omniBridgeBalance).to.be.equal(0)
    const tornadoPoolBlance = await token.balanceOf(tornadoPool.address)
    expect(tornadoPoolBlance).to.be.equal(
      aliceDpAmount.sub(aliceWithdrawAmount),
    )
  })

  it('[assignment] iii. see assignment doc for details', async () => {
    // [assignment] complete code here

    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)

    //generate keypairs for both actors
    const aliceKp = new Keypair()
    const bobKP = new Keypair()

    //create random wallets for both
    const aliceAdd = ethers.Wallet.createRandom().address
    const BobAdd = ethers.Wallet.createRandom().address

    const aliceDpAmount = utils.parseEther('0.13')
    const aliceToBobAmount = utils.parseEther('0.06')
    //bob empties all his newly found wealth
    const bobWithdrawAmount = utils.parseEther('0.06')
    //alice withdraws the remaining
    const aliceWithdrawAmount = aliceDpAmount.sub(bobWithdrawAmount)

    //generate alice deposit utxo
    const aliceDpUTXO = new Utxo({ amount: aliceDpAmount, keypair: aliceKp })
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [aliceDpUTXO],
    })
    const onTokenBridgedData = encodeDataForBridge({ proof: args, extData })
    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      aliceDpUTXO.amount,
      onTokenBridgedData,
    )
    //send to bridge
    await token.transfer(omniBridge.address, aliceDpAmount)
    const transferTX = await token.populateTransaction.transfer(
      tornadoPool.address,
      aliceDpAmount,
    )
    await omniBridge.execute([
      { who: token.address, callData: transferTX.data },
      { who: tornadoPool.address, callData: onTokenBridgedTx.data },
    ])

    //alice sends bob 0.06eth from the pool
    const aliceToBobUTXO = new Utxo({
      amount: aliceToBobAmount,
      keypair: Keypair.fromString(bobKP.address()),
    })
    //alice's change
    const aliceCallbackUTXO = new Utxo({
      amount: aliceDpAmount.sub(aliceToBobAmount),
      keypair: aliceDpUTXO.keypair,
    })
    await transaction({
      tornadoPool,
      inputs: [aliceDpUTXO],
      outputs: [aliceToBobUTXO, aliceCallbackUTXO],
    })

    //bob [parses chain to detect incoming funds
    const filter = tornadoPool.filters.NewCommitment()
    const fromBlock = await ethers.provider.getBlock()
    const events = await tornadoPool.queryFilter(filter, fromBlock.number)

    let bobReceiveUtxo
    try {
      bobReceiveUtxo = Utxo.decrypt(
        bobKP,
        events[0].args.encryptedOutput,
        events[0].args.index,
      )
    } catch (e) {
      // we try to decrypt another output here because it shuffles outputs before sending to blockchain
      bobReceiveUtxo = Utxo.decrypt(
        bobKP,
        events[1].args.encryptedOutput,
        events[1].args.index,
      )
    }

    //Bob gets his new found wealth
    await transaction({
      tornadoPool,
      inputs: [bobReceiveUtxo],
      outputs: [],
      recipient: BobAdd,
    })

    //Alice gets back her remaining funds(on L1)
    await transaction({
      tornadoPool,
      inputs: [aliceCallbackUTXO],
      outputs: [],
      recipient: aliceAdd,
      isL1Withdrawal: true,
    })

    //test balance changes
    const bobBalance = await token.balanceOf(BobAdd)
    expect(bobBalance.toString()).to.be.equal(utils.parseEther('0.06'))

    const aliceBalance = await token.balanceOf(aliceAdd)
    expect(aliceBalance).to.be.equal(0)

    const omniBridgeBalance = await token.balanceOf(omniBridge.address)
    expect(omniBridgeBalance).to.be.equal(aliceDpAmount.sub(aliceToBobAmount))

    const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
    expect(tornadoPoolBalance).to.be.equal(0)
  })
})
