{ ... }:
{
  # Keep a compressed in-memory swap cushion so brief memory spikes do not
  # stall interactive SSH/tmux sessions. This does not use a virtual disk.
  zramSwap = {
    enable = true;
    memoryPercent = 25;
  };
}
