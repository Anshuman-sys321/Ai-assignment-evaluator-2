
const supabaseUrl = "https://dezrvgfkzwdpdzztbiyo.supabase.co";
        const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlenJ2Z2ZrendkcGR6enRiaXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTQ0MDEsImV4cCI6MjA4NjczMDQwMX0.yspqyhyhG4k3V47vGi29eemNN-BPLhefrBfzvy82JLo";
        const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

        let performanceChart = null;

        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('active');
            document.getElementById('sidebarOverlay').classList.toggle('active');
        }

        function showSection(sectionId) {
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
            toggleSidebar();
        }

        document.getElementById("studentName").addEventListener("input", (e) => {
            const name = e.target.value;
            document.getElementById("userNameDisplay").innerText = name ? "Logged in as: " + name : "";
            loadAttendance();
            loadRank();
        });

        async function loadAttendance(){
            const name = document.getElementById("studentName").value.trim();
            if(!name) return;
            const { data } = await supabaseClient.from("attendance").select("*").eq("student_name", name);
            if(!data || data.length === 0){ updateRing(0); return; }
            const total = data.length;
            const present = data.filter(d => d.present).length;
            updateRing((present/total) * 100);
        }

        function updateRing(percent){
            const circle = document.getElementById("ringProgress");
            const circumference = 314;
            const offset = circumference - (percent/100) * circumference;
            circle.style.strokeDashoffset = offset;
            document.getElementById("attendancePercent").innerText = percent.toFixed(0) + "%";
        }

        async function submitAssignment(){
            const name = document.getElementById("studentName").value.trim();
            const title = document.getElementById("assignmentTitle").value.trim();
            const date = document.getElementById("submissionDate").value;
            const file = document.getElementById("assignmentFile").files[0];

            if(!name || !title || !date || !file){
                alert("Please fill all fields and sync your name first.");
                return;
            }

            const fileName = Date.now() + "-" + file.name;
            const { error: uploadError } = await supabaseClient.storage.from("assignments").upload(fileName, file);

            if(uploadError){ alert("Upload failed"); return; }

            const { data: publicData } = supabaseClient.storage.from("assignments").getPublicUrl(fileName);
            const fileUrl = publicData.publicUrl;

            const { data: inserted, error: insertError } = await supabaseClient.from("assignments").insert([{
                student_name: name, subject: "Math", title: title, submission_date: date, file_url: fileUrl, status: "Evaluating"
            }]).select();

            if(insertError) return;

            document.getElementById("submitMessage").innerText = "AI is evaluating...";

            try {
                const response = await fetch("https://dezrvgfkzwdpdzztbiyo.functions.supabase.co/compare-math", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": "Bearer " + supabaseKey },
                    body: JSON.stringify({ fileUrl: fileUrl, modelAnswer: "2+2=4\n5+5=10\n10-2=8" })
                });

                const result = await response.json();
                await supabaseClient.from("assignments").update({
                    status: "Checked", ai_remark: result.remark, total_marks: result.score || 0
                }).eq("id", inserted[0].id);

                document.getElementById("submitMessage").innerText = "AI Result: " + result.remark;
                loadRank();
            } catch {
                document.getElementById("submitMessage").innerText = "Submission stored. AI result pending.";
            }
        }


        async function showPerformance(){
            const name = document.getElementById("studentName").value.trim();
            if(!name){ alert("Enter your name in the Home tab first!"); return; }

            const { data } = await supabaseClient
                .from("assignments")
                .select("title, total_marks")
                .eq("student_name", name)
                .not("total_marks", "is", null)
                .order("submission_date", { ascending: true });

            if(!data || data.length === 0){
                alert("No graded assignments found.");
                return;
            }

            
            const labels = data.map(s => s.title); 
            const scores = data.map(s => s.total_marks);

            const ctx = document.getElementById("performanceChart").getContext("2d");
            if(performanceChart) performanceChart.destroy();

            performanceChart = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: labels,
                    datasets: [{ 
                        label: "Marks Obtained", 
                        data: scores, 
                        backgroundColor: "rgba(0, 198, 255, 0.6)",
                        borderColor: "#00c6ff",
                        borderWidth: 1 
                    }]
                },
                options: { 
                    responsive: true, 
                    scales: { 
                        y: { beginAtZero: true, max: 100, ticks: { color: "white" } },
                        x: { ticks: { color: "white" } }
                    },
                    plugins: {
                        legend: { labels: { color: "white" } }
                    }
                }
            });
        }

        async function loadRank(){
            const { data } = await supabaseClient.from("assignments").select("*");
            if(!data) return;
            let scores = {};
            data.forEach(s => {
                if(s.total_marks !== null){
                    if(!scores[s.student_name]) scores[s.student_name] = [];
                    scores[s.student_name].push(s.total_marks);
                }
            });
            let averages = Object.keys(scores).map(name => {
                let avg = scores[name].reduce((a, b) => a + b) / scores[name].length;
                return { name, avg };
            });
            averages.sort((a, b) => b.avg - a.avg);
            const currentName = document.getElementById("studentName").value;
            let rank = averages.findIndex(s => s.name === currentName);
            document.getElementById("studentRank").innerText = rank >= 0 ? "#" + (rank + 1) : "#--";
        }

        async function logout(){
            await supabaseClient.auth.signOut();
            window.location.href = "index.html";
        }
