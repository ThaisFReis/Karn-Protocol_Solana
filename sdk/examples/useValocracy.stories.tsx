import type { Meta, StoryObj } from "@storybook/react";

import { KarnSolanaProvider, useValocracy } from "../src/react";

const meta: Meta = {
  title: "Karn Protocol/useValocracy",
};

export default meta;

export const Default: StoryObj = {
  render: () => {
    useValocracy();
    return (
      <KarnSolanaProvider
        cluster="devnet"
        clients={undefined as any}
      >
        <div>Wire `clients` or `programs` to inspect Valocracy state.</div>
      </KarnSolanaProvider>
    );
  },
};
