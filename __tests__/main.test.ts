import * as core from '@actions/core';
import * as github from '@actions/github';
import {Octokit} from '@octokit/rest';

import {
  MilestoneProcessor,
  Issue,
  Milestone,
  MilestoneProcessorOptions
} from '../src/MilestoneProcessor';

function generateIssue(
  id: number,
  title: string,
  updatedAt: string,
  isPullRequest: boolean = false,
  labels: string[] = [],
  isClosed: boolean = false,
  isLocked: boolean = false
): Issue {
  return {
    number: id,
    labels: labels.map(l => {
      return {name: l};
    }),
    title: title,
    updated_at: updatedAt,
    pull_request: isPullRequest ? {} : null,
    state: isClosed ? 'closed' : 'open',
    locked: isLocked
  };
}

function generateMilestone(
  id: number,
  number: number,
  title: string,
  description: string,
  updatedAt: string,
  openIssues: number,
  closedIssues: number,
  isClosed: boolean = false
): Milestone {
  return {
    id: id,
    number: number,
    description: description,
    title: title,
    updated_at: updatedAt,
    open_issues: openIssues,
    closed_issues: closedIssues,
    state: isClosed ? 'closed' : 'open'
  };
}

const DefaultProcessorOptions: MilestoneProcessorOptions = {
  repoToken: 'none',
  debugOnly: true,
  reopenActive: false,
  minIssues: 1
};

test('empty milestone list results in 1 operation', async () => {
  const processor = new MilestoneProcessor(
    DefaultProcessorOptions,
    async () => []
  );

  // process our fake milestone list
  const operationsLeft = await processor.processMilestones(1);

  // processing an empty milestone list should result in 1 operation
  expect(operationsLeft).toEqual(99);
});

it('should close an open milestone with only closed issues', async () => {
  const TestMilestoneList: Milestone[] = [
    generateMilestone(
      1234,
      1,
      'Sprint 1',
      'First sprint',
      '2020-01-01T17:00:00Z',
      0,
      3
    )
  ];

  const processor = new MilestoneProcessor(DefaultProcessorOptions, async p =>
    p == 1 ? TestMilestoneList : []
  );

  // process our fake list
  await processor.processMilestones(1);

  expect(processor.closedMilestones.length).toEqual(1);
});

it('should not close an open milestone with only open issues', async () => {
  const TestMilestoneList: Milestone[] = [
    generateMilestone(
      1234,
      1,
      'My first issue',
      'First sprint',
      '2020-01-01T17:00:00Z',
      10,
      0
    )
  ];

  const processor = new MilestoneProcessor(DefaultProcessorOptions, async p =>
    p == 1 ? TestMilestoneList : []
  );

  // process our fake list
  await processor.processMilestones(1);

  expect(processor.closedMilestones.length).toEqual(0);
});

it('should not close an open milestone with an open issue', async () => {
  const TestMilestoneList: Milestone[] = [
    generateMilestone(
      1234,
      1,
      'My first issue',
      'First sprint',
      '2020-01-01T17:00:00Z',
      1,
      10
    )
  ];

  const processor = new MilestoneProcessor(DefaultProcessorOptions, async p =>
    p == 1 ? TestMilestoneList : []
  );

  // process our fake list
  await processor.processMilestones(1);

  expect(processor.closedMilestones.length).toEqual(0);
});

it('it should not process an milestone with not enough issues', async () => {
  const TestMilestoneList: Milestone[] = [
    generateMilestone(
      1234,
      1,
      'My first issue',
      'First sprint',
      '2020-01-01T17:00:00Z',
      1,
      1
    ),
    generateMilestone(
      1234,
      1,
      'My first issue',
      'First sprint',
      '2020-01-01T17:00:00Z',
      1,
      1,
      true
    )
  ];

  const options: MilestoneProcessorOptions = {
    ...DefaultProcessorOptions,
    minIssues: 10
  };

  const processor = new MilestoneProcessor(options, async p =>
    p == 1 ? TestMilestoneList : []
  );

  // process our fake list
  await processor.processMilestones(1);

  expect(processor.closedMilestones.length).toEqual(0);
  expect(processor.reopenedMilestones.length).toEqual(0);
});

it('should not reopen a closed milestone if reopen-active is false', async () => {
  const TestMilestoneList = [
    generateMilestone(
      1234,
      1,
      'My first issue',
      'First sprint',
      '2020-01-01T17:00:00Z',
      1,
      1,
      true
    )
  ];

  const processor = new MilestoneProcessor(DefaultProcessorOptions, async p =>
    p == 1 ? TestMilestoneList : []
  );

  await processor.processMilestones(1);

  expect(processor.reopenedMilestones.length).toEqual(0);
});

it('should not reopen a closed milestone if it has no open issues', async () => {
  const TestMilestoneList = [
    generateMilestone(
      1234,
      1,
      'My first issue',
      'First sprint',
      '2020-01-01T17:00:00Z',
      0,
      10,
      true
    )
  ];

  const options: MilestoneProcessorOptions = {
    ...DefaultProcessorOptions,
    reopenActive: true
  };

  const processor = new MilestoneProcessor(options, async p =>
    p == 1 ? TestMilestoneList : []
  );

  await processor.processMilestones(1);

  expect(processor.reopenedMilestones.length).toEqual(0);
});

it('should reopen a closed milestone if it has an open issue', async () => {
  const TestMilestoneList = [
    generateMilestone(
      1234,
      1,
      'My first issue',
      'First sprint',
      '2020-01-01T17:00:00Z',
      1,
      1,
      true
    )
  ];

  const options: MilestoneProcessorOptions = {
    ...DefaultProcessorOptions,
    reopenActive: true
  };

  const processor = new MilestoneProcessor(options, async p =>
    p == 1 ? TestMilestoneList : []
  );

  await processor.processMilestones(1);

  expect(processor.reopenedMilestones.length).toEqual(1);
});
