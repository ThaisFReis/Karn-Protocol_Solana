import type { Meta, StoryObj } from "@storybook/react";

import { KarnSolanaProvider, useTreasury } from "../src/react";

const meta: Meta = {
  title: "Karn Protocol/useTreasury",
};

export default meta;

export const Default: StoryObj = {
  render: () => {
    useTreasury();
    return (
      <KarnSolanaProvider
        cluster="devnet"
        clients={undefined as any}
      >
        <div>Provide connected programs/clients to inspect shares and scholarships.</div>
      </KarnSolanaProvider>
    );
  },
};
