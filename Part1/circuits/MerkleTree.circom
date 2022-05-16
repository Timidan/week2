pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/switcher.circom";

template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves
    var hCount=0;
    for(var i=0;i<n;i++){
        hCount=hCount+2**i;
    }
    component hashers[hCount];

     for(var i=0;i<hCount;i++){
        hashers[i]=Poseidon(2);
    }

    for(var i=0;i<2**(n-1);i++){
        hashers[i].inputs[0] <== leaves[i*2];
        hashers[i].inputs[1] <== leaves[i*2+1];
    }

    var f=0;
    for (var i=2**(n-1);i<hCount;i++){
        hashers[i].inputs[0] <== hashers[2*f].out;
        hashers[i].inputs[1] <== hashers[2*f+1].out;
        f++;
    }
root <== hashers[hCount-1].out;

}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path
   component switcher[n];
   component hasher[n];

   for(var i=0;i<n;i++){
       switcher[i]=Switcher();
       switcher[i].L <== i == 0 ? leaf : hasher[i-1].out;
       switcher[i].R <== path_elements[i];
       switcher[i].sel <== path_index[i];
       //calculate hash
       hasher[i]=Poseidon(2);
        hasher[i].inputs[0] <== switcher[i].outL;
        hasher[i].inputs[1] <== switcher[i].outR;
   }

root <== hasher[n-1].out;


}