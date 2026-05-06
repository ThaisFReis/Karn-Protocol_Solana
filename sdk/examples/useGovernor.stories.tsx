import type { Meta, StoryObj } from "@storybook/react";

import { KarnSolanaProvider, useGovernor } from "../src/react";

const meta: Meta = {
  title: "Karn Protocol/useGovernor",
};

export default meta;

export const Default: StoryObj = {
  render: () => {
    useGovernor();
    return (
      <KarnSolanaProvider
        cluster="devnet"
        clients={undefined as any}
      >
        <div>Provide connected programs/clients to inspect proposals and voting.</div>
      </KarnSolanaProvider>
    );
  },
};
