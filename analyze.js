#!/usr/bin/env node
const request = require('request-promise-native');
const Table = require('easy-table');

const host = 'https://wallet.shiftnrg.org';

// Array of shift address to account data
const voters = {};
const parallelVoters = 50;
const parallelDelegates = 20;

function makeRequest(url) {
    // console.log(`Fetching ${host}${url}`);
    return request(host + url);
}

async function getDelegates() {
    console.log('Fetching delegate list…');
    let totalDelegates = await makeRequest('/api/delegates/count');

    const count = JSON.parse(totalDelegates).count;

    let fetched = 0;
    let offset = 0;
    let allDelegates = [];
    while (fetched < count) {
        let delegates;
        console.log('.');
        delegates = await makeRequest(`/api/delegates?offset=${fetched}&limit=100`);

        allDelegates = allDelegates.concat(JSON.parse(delegates).delegates);
        fetched += 100;
    }

    return allDelegates;
}

async function getVotes(voter) {
    if (voters[voter.address]) {
        return voters[voter.address].votes;
    }

    const votes = await makeRequest(`/api/accounts/delegates?address=${voter.address}`);
    return JSON.parse(votes).delegates;
}

async function getVoters(delegate) {
    let delegateVoters = await makeRequest(`/api/delegates/voters?publicKey=${delegate.publicKey}`);
    delegateVoters = JSON.parse(delegateVoters).accounts;
    delegate.voters = delegateVoters;

    let unfetched = Array.from(delegate.voters).filter((voter) => {
        return !voters.hasOwnProperty(voter.address);
    })

    for (let i = 0; i < unfetched.length; i += parallelVoters) {
        let group = unfetched.slice(i, i + parallelVoters);
        const calls = group.map((voter) => getVotes(voter));
        console.log(` - Fetching ${calls.length} voter${calls.length === 1 ? '' : 's'}`);
        const results = await Promise.all(calls);

        group.forEach((voter, i) => {
            voter.votes = results[i];
            voters[voter.address] = voter;
        });
    }
}

function assignScores(delegate) {
    delegate.scorePopular = 0;
    delegate.scoreDefault = 0;
    delegate.scoreWeighted = 0;

    if (!delegate.voters || delegate.voters.length === 0) {
        return;
    }

    delegate.scorePopular = delegate.voters.length;
    delegate.scoreDefault = delegate.voters.reduce((sum, voter) => {
        voter = voters[voter.address];
        return sum + parseInt(voter.balance, 10);
    }, 0);

    delegate.scoreWeighted = delegate.voters.reduce((sum, voter) => {
        voter = voters[voter.address]
        return sum + (parseInt(voter.balance, 10) / voter.votes.length);
    }, 0);
}

function printRanks(delegates) {
    for (const delegate of delegates) {
        assignScores(delegate);
    }

    const defaultOrder = Array.from(delegates).sort((a, b) => {
        return b.scoreDefault - a.scoreDefault;
    });

    const popularOrder = Array.from(delegates).sort((a, b) => {
        return b.scorePopular - a.scorePopular;
    });

    const weightedOrder = Array.from(delegates).sort((a, b) => {
        return b.scoreWeighted - a.scoreWeighted;
    });

    const table = new Table;

    defaultOrder.forEach((delegate, i) => {
        delegate.defaultRank = i + 1;
        if (delegate.defaultRank > 101) {
            delegate.defaultRank = '';
        }

        delegate.popularRank = popularOrder.indexOf(delegate) + 1;
        if (delegate.popularRank === 0 || delegate.popularRank > 101) {
            delegate.popularRank = '';
        }

        delegate.weightedRank = weightedOrder.indexOf(delegate) + 1;
        if (delegate.weightedRank === 0 || delegate.weightedRank > 101) {
            delegate.weightedRank = '';
        }

        table.cell('Username', delegate.username);
        table.cell('Current Rank', delegate.defaultRank);
        table.cell('Weighted Rank', delegate.weightedRank);
        table.cell('Popular Rank', delegate.popularRank);
        table.newRow();
    });

    console.log('\n\n');
    console.log(table.toString());
}

async function run() {
    let delegates;
    try {
        delegates = await getDelegates();
    } catch (e) {
        console.error('Error getting delegates', e);
        return
    }

    // The data for the voters is pulled for each delegate so by fetching the
    // first delegate on its own (not in parallel) it allows us to fetch
    // the majority of the voter information in parallel without causing a
    // stampede of requests for overlapping voters.
    console.log('Pre-fetching delegate 1');
    await getVoters(delegates[0]);

    // The rest of the delegates can be fetched in parallel since it will only
    // fetch voter data for voters that have not already voted for previous
    // delegates
    for (let i = 0; i < delegates.length; i += parallelDelegates) {
        let group = delegates.slice(i, i + parallelDelegates);
        console.log(`Fetching delegates ${i + 1} to ${i + parallelDelegates}`);
        const calls = group.map((delegate) => getVoters(delegate));
        try {
            const results = await Promise.all(calls);
        } catch(e) {
            console.error(e);
        }
    }

    try {
        printRanks(delegates);
    } catch(e) {
        console.error(e);
    }
}

run();
