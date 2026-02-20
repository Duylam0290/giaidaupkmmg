// Khởi tạo Supabase Client
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener('DOMContentLoaded', () => {
    const bracketContainer = document.getElementById('bracket-container');
    const tournamentNameDisplay = document.getElementById('view-tournament-name');
    const seasonSelector = document.getElementById('season-selector');

    let currentTournamentId = null;
    let allMatches = [];
    let numRounds = 1;

    async function initViewer() {
        // 1. Lấy danh sách tất cả giải đấu
        const { data: tournaments } = await _supabase
            .from('tournaments')
            .select('*')
            .order('created_at', { ascending: false });

        if (tournaments && tournaments.length > 0) {
            // Đổ dữ liệu vào selector
            seasonSelector.innerHTML = tournaments.map(t => {
                const date = new Date(t.created_at).toLocaleDateString('vi-VN');
                return `<option value="${t.id}">${t.name} (${date})</option>`;
            }).join('');

            // Mặc định chọn giải mới nhất
            await switchTournament(tournaments[0].id);
        }
    }

    async function switchTournament(id) {
        const { data: t } = await _supabase.from('tournaments').select('*').eq('id', id).single();
        if (t) {
            currentTournamentId = t.id;
            tournamentNameDisplay.textContent = t.name;
            numRounds = t.total_rounds;
            await fetchAndRender();
            subscribeToChanges();
        }
    }

    seasonSelector.onchange = (e) => switchTournament(e.target.value);

    async function fetchAndRender() {
        const { data: matches } = await _supabase
            .from('matches')
            .select('*')
            .eq('tournament_id', currentTournamentId)
            .order('round_number', { ascending: true })
            .order('match_number', { ascending: true });

        if (matches) {
            allMatches = matches;
            renderBracket();
        }
    }

    function renderBracket() {
        bracketContainer.innerHTML = '';
        
        for (let r = 1; r <= numRounds; r++) {
            const roundDiv = document.createElement('div');
            roundDiv.className = 'round flex flex-col justify-around mr-12 min-w-[300px]';
            roundDiv.innerHTML = `<h3 class="text-xl font-bold text-center mb-8 text-indigo-400 uppercase tracking-widest italic">Vòng ${r}</h3>`;

            const matchesInRound = allMatches.filter(m => m.round_number === r);
            matchesInRound.forEach(match => {
                const matchDiv = document.createElement('div');
                matchDiv.className = 'match';
                
                const p1Name = match.player1_name || '...';
                const p2Name = match.player2_name || '...';
                const winner = match.winner_name;

                const renderPlayer = (name) => {
                    const isWinner = winner === name && name !== '...';
                    const isLoser = winner && winner !== name && name !== '...';
                    
                    let slotClass = 'player-slot';
                    let textClass = 'font-bold tracking-tight';
                    
                    if (isWinner) {
                        slotClass += ' winner-bg';
                        textClass += ' winner-text';
                    } else if (isLoser) {
                        slotClass += ' loser-bg';
                        textClass += ' loser-text';
                    } else {
                        textClass += ' text-gray-300';
                    }

                    let html = `<div class="${slotClass}">`;
                    html += `<span class="${textClass}">${name}</span>`;
                    if (isWinner && r === numRounds) {
                        html += `<span class="champion-cup text-2xl">🏆</span>`;
                    }
                    html += `</div>`;
                    return html;
                };

                const vsDivider = `
                    <div class="vs-divider">
                        <span class="vs-text">VS</span>
                    </div>
                `;

                matchDiv.innerHTML = renderPlayer(p1Name) + vsDivider + renderPlayer(p2Name);
                roundDiv.appendChild(matchDiv);
            });

            bracketContainer.appendChild(roundDiv);
        }
    }

    // --- REALTIME SYNC ---
    function subscribeToChanges() {
        _supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'matches',
                    filter: `tournament_id=eq.${currentTournamentId}`
                },
                (payload) => {
                    console.log('Change received!', payload);
                    fetchAndRender(); // Tải lại và vẽ lại khi có bất kỳ thay đổi nào
                }
            )
            .subscribe();
            
        // Cũng theo dõi thay đổi ở bảng tournaments (ví dụ đổi tên giải)
        _supabase
            .channel('tournament-updates')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'tournaments',
                    filter: `id=eq.${currentTournamentId}`
                },
                (payload) => {
                    tournamentNameDisplay.textContent = payload.new.name;
                    numRounds = payload.new.total_rounds;
                }
            )
            .subscribe();
    }

    initViewer();
});
