# Shift voter analysis

This script runs through all of the shift delegates and calculates their rank based on different voting schemes. Currently it uses the current algorithm (weight equal to shift coin holdings), a weighted algorithm (weight equal to shift coin holdings divided by number of votes), and a popular vote (counting total number of votes with no weighting at all).

The current results can be seen in the results.txt file.

## Running

It uses ES6 and native promises so requires node 8 to run.

```
cd shift-voter-analysis
yarn install
./analyze.js
```
