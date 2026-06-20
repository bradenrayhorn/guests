vim.cmd.packadd("nvim-autopairs")
vim.cmd.packadd("vim-commentary")
vim.cmd.packadd("vim-surround")
vim.cmd.packadd("arrow-nvim")

require("nvim-autopairs").setup()

require("arrow").setup({
	show_icons = false,
	leader_key = "\\",
	buffer_leader_key = "m",
})
