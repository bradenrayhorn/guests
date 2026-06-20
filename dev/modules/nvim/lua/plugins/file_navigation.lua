vim.cmd.packadd("oil.nvim")
vim.cmd.packadd("snacks-nvim")

require("oil").setup({
	default_file_explorer = true,
	columns = { "icon" },
})

require("snacks").setup({
	picker = {},
})

vim.keymap.set("n", "<leader><space>", function()
	Snacks.picker.smart()
end, { desc = "Smart Find Files" })

vim.keymap.set("n", "<leader>gh", function()
	Snacks.picker.git_diff({ group = true })
end, { desc = "Git diff" })

vim.keymap.set("n", "<leader>e", function()
	Snacks.picker.buffers()
end, { desc = "Buffers" })

vim.keymap.set("n", "<leader>/", function()
	Snacks.picker.grep()
end, { desc = "Grep" })

vim.keymap.set("n", "<leader>:", function()
	Snacks.picker.command_history()
end, { desc = "Command History" })

vim.keymap.set("n", "<leader>n", function()
	Snacks.picker.notifications()
end, { desc = "Notification History" })

vim.keymap.set("n", "<leader>fe", function()
	Snacks.explorer()
end, { desc = "File Explorer" })
