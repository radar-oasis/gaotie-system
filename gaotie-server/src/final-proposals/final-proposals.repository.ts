import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ArchiveFinalProposalInput,
  ArchivedProposal,
} from './final-proposals.types';

@Injectable()
export class FinalProposalsRepository {
  private readonly proposals = new Map<string, ArchivedProposal>();

  archive(input: ArchiveFinalProposalInput): ArchivedProposal {
    const now = new Date().toISOString();
    const id = randomUUID();
    const proposal: ArchivedProposal = {
      ...input,
      id,
      name: input.name?.trim() || `方案 V${input.version}`,
      createdAt: now,
      updatedAt: now,
    };

    this.proposals.set(id, proposal);

    return proposal;
  }

  list(): ArchivedProposal[] {
    return [...this.proposals.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  get(id: string): ArchivedProposal {
    const proposal = this.proposals.get(id);

    if (!proposal) {
      throw new NotFoundException(`方案不存在: ${id}`);
    }

    return proposal;
  }

  remove(id: string): void {
    this.proposals.delete(id);
  }
}
