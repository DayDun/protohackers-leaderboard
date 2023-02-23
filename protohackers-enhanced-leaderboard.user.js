// ==UserScript==
// @name        Protohackers Enhanced Leaderboard
// @description Get enhanced statistics and alternative rankings on the leaderboard.
// @version     1.0
// @author      DayDun
// @namespace   https://github.com/DayDun/protohackers-leaderboard/
// @updateURL   https://github.com/DayDun/protohackers-leaderboard/raw/master/protohackers-enhanced-leaderboard.user.js
// @downloadURL https://github.com/DayDun/protohackers-leaderboard/raw/master/protohackers-enhanced-leaderboard.user.js
// @match       https://protohackers.com/leaderboard
// @grant       none
// @run-at      document-start
// ==/UserScript==

async function init() {
	let problemsRaw = await fetch("https://api.protohackers.com/problems/").then(res => res.json()).then(res => res.problems);
	
	class User {
		constructor(id, displayname, repo) {
			this.id = id;
			this.displayname = displayname;
			this.repo = repo;
			this.placements = [];
			this.rankSum = 0;
			this.rankLogSum = 0;
			this.recentSolve = 0;
		}
	}
	
	class Problem {
		constructor(data) {
			this.data = data;
			this.id = data.id;
			this.title = data.title;
			this.release = new Date(data.release);
			this.attempts = data.attempts;
			this.leaderboard = [];
		}
	}
	
	class ProblemPlacement {
		constructor(data, problem, user, rank, time) {
			this.data = data;
			this.problem = problem;
			this.user = user;
			this.rank = rank;
			this.time = time;
		}
	}
	
	let problems = [];
	let users = {};
	for (let problemData of problemsRaw) {
		let leaderboard = await fetch("https://api.protohackers.com/leaderboard/" + problemData.id)
			.then(res => res.json()).then(res => res.leaderboard);
		
		let problem = new Problem(problemData);
		problems.push(problem);
		
		for (let i = 0; i < leaderboard.length; i++) {
			let solve = leaderboard[i];
			if (!(solve.user_id in users)) {
				let user = new User(solve.user_id, solve.displayname, solve.repo_url);
				users[user.id] = user;
			}
			let user = users[solve.user_id];
			
			let time = new Date(solve.solved_at) - new Date(problem.release);
			let placement = new ProblemPlacement(solve, problem, user, i + 1, time);
			user.placements.push(placement);
			problem.leaderboard.push(placement);
		}
	}
	
	problems.sort((a, b) => a.release - b.release);
	
	for (let problem of problems) {
		for (let placement of problem.leaderboard) {
			placement.user.recentSolve = placement.time;
		}
	}
	
	function formatTime(time) {
		let seconds = Math.floor((time / 1000) % 60).toString().padStart(2, "0");
		let minutes = Math.floor((time / 1000 / 60) % 60).toString().padStart(2, "0");
		let hours = Math.floor((time / 1000 / 60 / 60) % 24).toString().padStart(2, "0");
		let days = Math.floor(time / 1000 / 60 / 60 / 24).toString();
		return `${days}:${hours}:${minutes}:${seconds}`;
	}
	
	let rankingSelect = document.createElement("select");
	rankingSelect.className = "ranking";
	for (let [id, label, isDefault] of [
		["standard", "Standard Ranking", true],
		["75%", "Remove 25% Worst Scores", false],
		["24h", "Top Within 24 Hours", false],
		["top50", "Top 50 / Day", false],
		["log", "Logarithmic Ranking", false],
		["medals", "Most Medals", false]
	]) {
		let option = document.createElement("option");
		option.value = id;
		option.textContent = label;
		option.default = isDefault;
		rankingSelect.appendChild(option);
	}
	
	rankingSelect.addEventListener("change", () => {
		renderLeaderboard();
	});
	
	let whatifLabel = document.createElement("label");
	let whatifCheckbox = document.createElement("input");
	whatifCheckbox.type = "checkbox";
	whatifCheckbox.addEventListener("change", () => {
		renderLeaderboard();
	});
	whatifLabel.appendChild(whatifCheckbox);
	whatifLabel.appendChild(document.createTextNode("If everyone solved every problem"));
	
	let table = document.querySelector("table");
	table.parentNode.insertBefore(rankingSelect, table);
	table.parentNode.insertBefore(whatifLabel, table);
	
	function renderLeaderboard() {
		let elem = document.querySelector("table > tbody");
		while (elem.firstChild)
			elem.removeChild(elem.firstChild);
		
		let whatif = whatifCheckbox.checked;
		
		let removed = [];
		let placements = {};
		let isPlacementsFiltered = false;
		if (rankingSelect.value === "24h") isPlacementsFiltered = true;
		if (rankingSelect.value === "top50") isPlacementsFiltered = true;
		for (let problem of problems) {
			if (problem.id === 0) continue;
			let toRemove = problem.leaderboard.filter(a => {
				if (rankingSelect.value === "24h" && a.time > 24 * 60 * 60 * 1000) return true;
				if (rankingSelect.value === "top50" && a.rank > 50) return true;
				return false;
			});
			removed = removed.concat(toRemove);
			placements[problem.id] = problem.leaderboard.filter(a => !removed.includes(a));
		}
		
		if (rankingSelect.value === "75%") {
			for (let user of Object.values(users)) {
				let plc = user.placements.filter(a => a.problem.id !== 0).sort((a, b) => a.rank - b.rank);
				for (let placement of plc.slice(Math.ceil(plc.length * 0.75))) {
					//let list = placements[placement.problem.id];
					//list.splice(list.indexOf(placement), 1);
					removed.push(placement);
				}
			}
		}
		
		for (let user of Object.values(users)) {
			let sum = 0;
			let logSum = 0;
			for (let problem of problems) {
				if (problem.id === 0) continue;
				let placement = placements[problem.id].find(a => a.user.id === user.id);
				let rank;
				if (placement) {
					if (isPlacementsFiltered) rank = placements[problem.id].length - placement.rank;
					else if (removed.includes(placement)) rank = 0;
					else rank = placement.rank;
				} else {
					// FIXME: If the filter duration has not yet passed, whatif scoring should technically be used here
					if (isPlacementsFiltered) rank = 0;
					else rank = whatif ? problem.leaderboard.length + 1 : Object.values(users).length;
				}
				//let rank = placement ? placement.rank : Object.values(users).length;
				sum += rank;
				logSum += Math.log10(rank);
			}
			user.rankSum = sum;
			user.rankLogSum = logSum;
		}
		
		let leaderboard = Object.values(users);
		if (rankingSelect.value === "standard") {
			leaderboard.sort((a, b) => {
				if (a.rankSum - b.rankSum !== 0) return a.rankSum - b.rankSum;
				return a.recentSolve - b.recentSolve;
			});
		} else if (rankingSelect.value === "75%") {
			leaderboard.sort((a, b) => {
				if (a.rankSum - b.rankSum !== 0) return a.rankSum - b.rankSum;
				return a.recentSolve - b.recentSolve;
			});
		} else if (rankingSelect.value === "24h") {
			leaderboard.sort((a, b) => {
				if (b.rankSum - a.rankSum !== 0) return b.rankSum - a.rankSum;
				return a.recentSolve - b.recentSolve;
			});
		} else if (rankingSelect.value === "top50") {
			leaderboard.sort((a, b) => {
				if (b.rankSum - a.rankSum !== 0) return b.rankSum - a.rankSum;
				return a.recentSolve - b.recentSolve;
			});
		} else if (rankingSelect.value === "log") {
			leaderboard.sort((a, b) => {
				if (a.rankLogSum - b.rankLogSum !== 0) return a.rankLogSum - b.rankLogSum;
				return a.recentSolve - b.recentSolve;
			});
		} else if (rankingSelect.value === "medals") {
			leaderboard.sort((a, b) => {
				let medalsA = a.placements.filter(a => a.problem.id !== 0 && a.rank <= 3).length;
				let medalsB = b.placements.filter(a => a.problem.id !== 0 && a.rank <= 3).length;
				if (medalsB - medalsA !== 0) return medalsB - medalsA;
				if (a.rankSum - b.rankSum !== 0) return a.rankSum - b.rankSum;
				return a.recentSolve - b.recentSolve;
			});
		}
		
		let tableHead = document.createElement("tr");
		const addTh = (content, title, className = "") => {
			let th = document.createElement("th");
			if (title)
				th.title = title;
			th.className = className;
			th.appendChild(content);
			tableHead.appendChild(th);
		};
		addTh(document.createTextNode("# "), "Global Rank", "rank");
		addTh(document.createTextNode("Display Name"), null, "name");
		if (rankingSelect.value === "log") {
			addTh(document.createTextNode("Σ log₁₀🏆"), "Sum of All Log Placements", "sum");
		} else {
			addTh(document.createTextNode("Σ🏆"), "Sum of All Placements", "sum");
		}
		addTh(document.createTextNode("Σ⏱"), "Sum of All Solve Times", "sum");
		addTh(document.createTextNode("🌟"), "Problems Solved");
		addTh(document.createTextNode("🥇"), "First Place Solves");
		addTh(document.createTextNode("🥈"), "Second Place Solves");
		addTh(document.createTextNode("🥉"), "Third Place Solves");
		addTh(document.createTextNode("Σ🏅"), "Total Medals");
		for (let problem of problems) {
			let problemTitle = document.createElement("span");
			problemTitle.textContent = `${problem.id}: ${problem.title}`;
			addTh(problemTitle, null, "problem");
		}
		elem.appendChild(tableHead);
		
		for (let i = 0; i < leaderboard.length; i++) {
			let rank = i + 1;
			let user = leaderboard[i];
			
			let tr = document.createElement("tr");
			tr.className = i % 2 === 0 ? "leaderboard_even__3JRZb" : "leaderboard_odd__9BWFA";
			const addTd = (content, className) => {
				let td = document.createElement("td");
				td.className = className;
				td.appendChild(content);
				tr.appendChild(td);
			};
			addTd(document.createTextNode(`${rank}.`), "rank");
			let displayname = document.createElement("b");
			displayname.className = "leaderboard_truncate__CQD4F";
			if (user.repo) {
				let link = document.createElement("a");
				link.href = user.repo;
				link.rel = "nofollow";
				link.textContent = user.displayname;
				displayname.appendChild(link);
			} else {
				displayname.textContent = user.displayname;
			}
			addTd(displayname, "name" + (user.displayname === "unnamed" ? " unnamed" : ""));
			
			if (rankingSelect.value === "log") {
				addTd(document.createTextNode(user.rankLogSum.toFixed(2)), "sum");
			} else {
				addTd(document.createTextNode(user.rankSum), "sum");
			}
			
			let time = 0;
			let solves = 0;
			let first = 0;
			let second = 0;
			let third = 0;
			
			for (let placement of user.placements) {
				if (placement.problem.id === 0) continue;
				
				solves++;
				if (!removed.includes(placement))
					time += placement.time;
				if (placement.rank === 1) first++;
				if (placement.rank === 2) second++;
				if (placement.rank === 3) third++;
			}
			
			addTd(document.createTextNode(formatTime(time)), "time");
			addTd(document.createTextNode(solves), "center");
			addTd(document.createTextNode(first), "center");
			addTd(document.createTextNode(second), "center");
			addTd(document.createTextNode(third), "center");
			addTd(document.createTextNode(first + second + third), "center");
			
			for (let problem of problems) {
				let placement = problem.leaderboard.find(a => a.user.id === user.id);
				if (!placement) {
					if (whatif)
						addTd(document.createTextNode("~" + (problem.leaderboard.length + 1)), "score nil whatif");
					else
						addTd(document.createTextNode("-"), "score nil");
				} else {
					let rankText = placement.rank;
					if (rankText === 1) rankText = "🥇";
					if (rankText === 2) rankText = "🥈";
					if (rankText === 3) rankText = "🥉";
					let span = document.createElement("span");
					span.textContent = rankText;
					span.title = "Solved in " + formatTime(placement.time);
					addTd(span, "score");
				}
			}
			elem.appendChild(tr);
		}
	}
	
	renderLeaderboard();
	
	let style = document.createElement("style");
	style.textContent = `
	.container {
		max-width: 1250px;
	}
	
	table.leaderboard_leaderboard__89MED td,
	table.leaderboard_leaderboard__89MED th,
	table.leaderboard_leaderboard__89MED tr {
		padding: 0 5px;
	}
	table {
		font-family: monospace;
		font-size: 16px;
	}
	
	table th {
		vertical-align: bottom;
	}
	table th.rank {
		white-space: pre;
	}
	table th.rank,
	table th.sum {
		text-align: right;
	}
	table th.name {
		text-align: left;
	}
	table th.problem {
		height: 180px;
	}
	table th.problem > span {
		display: inline-block;
		width: 32px;
		transform: translate(16px, -8px) rotate(-45deg);
		font-size: 14px;
		white-space: pre;
	}
	
	table td.center {
		text-align: center;
	}
	
	table td.unnamed {
		font-style: italic;
	}
	
	table td.rank,
	table td.sum,
	table td.time,
	table td.score {
		text-align: right;
	}
	table td.score.whatif {
		color: #999;
	}
	`;
	document.head.appendChild(style);
}

init();