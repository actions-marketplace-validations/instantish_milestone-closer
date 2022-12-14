import * as core from '@actions/core';
import * as github from '@actions/github';
import {Octokit} from '@octokit/rest';

type OctoKitMilestoneList =
  Octokit.Response<Octokit.IssuesListMilestonesForRepoResponse>;

const OPERATIONS_PER_RUN = 100;

export interface Issue {
  title: string;
  number: number;
  updated_at: string;
  labels: Label[];
  pull_request: any;
  state: string;
  locked: boolean;
}

export interface Milestone {
  id: number;
  title: string;
  number: number;
  updated_at: string;
  description: string;
  open_issues: number;
  closed_issues: number;
  state: string;
}

export interface Label {
  name: string;
}

export interface MilestoneProcessorOptions {
  debugOnly: boolean;
  minIssues: number;
  reopenActive: boolean;
  repoToken: string;
}

/** Handle processing of issues for staleness/closure. */
export class MilestoneProcessor {
  readonly client: github.GitHub;
  readonly options: MilestoneProcessorOptions;
  private operationsLeft = 0;

  readonly closedMilestones: Milestone[] = [];
  readonly reopenedMilestones: Milestone[] = [];

  constructor(
    options: MilestoneProcessorOptions,
    getMilestones?: (page: number) => Promise<Milestone[]>
  ) {
    this.options = options;
    this.operationsLeft = OPERATIONS_PER_RUN;
    this.client = new github.GitHub(options.repoToken);

    if (getMilestones) {
      this.getMilestones = getMilestones;
    }

    if (this.options.debugOnly) {
      core.warning(
        'Executing in debug mode. Debug output will be written but no milestones will be processed.'
      );
    }
  }

  async processMilestones(page = 1): Promise<number> {
    if (this.operationsLeft <= 0) {
      core.warning('Reached max number of operations to process. Exiting.');
      return 0;
    }

    // get the next batch of milestones
    const milestones: Milestone[] = await this.getMilestones(page);
    this.operationsLeft -= 1;

    if (milestones.length <= 0) {
      core.debug('No more milestones found to process. Exiting.');
      return this.operationsLeft;
    }

    for (const milestone of milestones.values()) {
      const totalIssues = milestone.open_issues + milestone.closed_issues;
      const {number, title} = milestone;
      const updatedAt = milestone.updated_at;
      const openIssues = milestone.open_issues;

      core.debug(
        `Found milestone: milestone #${number} - ${title} last updated ${updatedAt}`
      );

      if (totalIssues < this.options.minIssues) {
        core.debug(
          `Skipping ${title} because it has less than ${this.options.minIssues} issues`
        );
      } else if (openIssues > 0) {
        if (milestone.state === 'open')
          core.debug(`Skipping ${title} because it has open issues/prs`);
        else if (this.options.reopenActive)
          await this.reopenMilestone(milestone);
      } else if (milestone.state === 'open') {
        // Close instantly because there isn't a good way to tag milestones
        // and do another pass.
        await this.closeMilestone(milestone);
      }
    }

    // do the next batch
    return this.processMilestones(page + 1);
  }

  /** Get issues from GitHub in baches of 100 */
  private async getMilestones(page: number): Promise<Milestone[]> {
    const milestoneResult: OctoKitMilestoneList =
      await this.client.issues.listMilestonesForRepo({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        state: 'open',
        per_page: 100,
        page
      });

    return milestoneResult.data;
  }

  private async closeMilestone(milestone: Milestone): Promise<void> {
    core.debug(`Closing milestone #${milestone.number} - ${milestone.title}`);

    this.closedMilestones.push(milestone);

    if (this.options.debugOnly) return;

    await this.client.issues.updateMilestone({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      milestone_number: milestone.number,
      state: 'closed'
    });
  }

  private async reopenMilestone(milestone: Milestone): Promise<void> {
    core.debug(`Reopening milestone #${milestone.number} - ${milestone.title}`);

    this.reopenedMilestones.push(milestone);

    if (this.options.debugOnly) return;

    await this.client.issues.updateMilestone({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      milestone_number: milestone.number,
      state: 'open'
    });
  }
}
