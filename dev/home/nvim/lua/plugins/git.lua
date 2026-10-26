vim.cmd.packadd("fugitive")

vim.cmd.packadd("gitsigns.nvim")
require("gitsigns").setup()

vim.cmd.packadd("diffview.nvim")
require("diffview").setup({
	keymaps = {
		-- Keep <leader>e available for the buffer picker in Diffview too.
		view = { ["<leader>e"] = false },
		file_panel = { ["<leader>e"] = false },
		file_history_panel = { ["<leader>e"] = false },
	},
})
