//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {PoseidonT3} from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root
    uint256 immutable leaves_max;
    uint256 constant tree_size = 15;

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        leaves_max = 8;
        //fill with zeroes
        for (uint8 i = 0; i < tree_size; i++) {
            hashes.push(0);
        }
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256 finalRoot) {
        // [assignment] insert a hashed leaf into the Merkle tree
        assert(leaves_max > index);
        hashes[index] = hashedLeaf;
        index++;

        //get root
        uint256 id = leaves_max;
        for (uint8 i = 0; i < tree_size - 1; i += 2) {
            //get pair hashes
            uint hash = PoseidonT3.poseidon([hashes[i], hashes[i + 1]]);
            hashes[id] = hash;
            id++;
        }
        root = hashes[tree_size - 1];
        finalRoot = root;
    }

    function verify(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[1] memory input
    ) public view returns (bool) {
        // [assignment] verify an inclusion proof and check that the proof root matches current root
        if (Verifier.verifyProof(a, b, c, input) == false) {
            return false;
        }
        uint256 toVerify = input[0];
        if (toVerify != root) {
            return false;
        }
        return true;
    }
}
