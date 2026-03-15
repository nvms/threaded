let threadId;
let history = [];

function init() {
  threadId = Math.random().toString(36).substring(2, 9);
  document.getElementById("input").focus();
  // and move the cursor to the end of the line
  document.getElementById("input").selectionStart = document.getElementById("input").value.length;
}

function sendMessage() {
  const input = document.getElementById("input");
  const message = input.value.trim();
  if (!message) return;

  addMessage("user", message);
  input.value = "";

  const assistantDiv = addMessage("assistant", "");

  fetch(`/chat/${threadId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  })
    .then((response) => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      function readStream() {
        reader.read().then(({ done, value }) => {
          if (done) return;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          lines.forEach((line) => {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                switch (data.type) {
                  case "content":
                    assistantDiv.textContent += data.content;
                    break;
                  case "tool_calls_ready":
                    addToolStatus(`${data.calls.length} tool(s) pending...`);
                    break;
                  case "tool_executing":
                    addToolStatus(`Executing ${data.name} with arguments ${data.arguments}...`);
                    break;
                  case "tool_complete":
                    addToolStatus(`${data.name} completed: ${JSON.stringify(data.result)}`);
                    break;
                  case "tool_error":
                    addToolStatus(`${data.name} failed: ${data.error}`);
                    break;
                  case "complete":
                    break;
                  case "error":
                    assistantDiv.textContent = `Error: ${data.message}`;
                    break;
                }
              } catch (e) {
                // skip invalid JSON
              }
            }
          });

          readStream();
        });
      }

      readStream();
    })
    .catch((error) => {
      assistantDiv.textContent = `Network error: ${error.message}`;
    });
}

function addMessage(role, content) {
  const div = document.createElement("div");
  div.classList.add("br6", "p2", "bw1", "b-neutral-30-auto", "df", "fdc", "aifs");
  div.innerHTML = `<span class="mr2 c-neutral-40-auto f1 ttu fw5">${role}</span><span>${content}</span>`;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop =
    document.getElementById("messages").scrollHeight;
  return div.querySelector("span:nth-child(2)");
}

function addToolStatus(text) {
  const div = document.createElement("div");
  div.classList.add("c-neutral-50-auto", "f2", "pl6");
  div.textContent = text;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop =
    document.getElementById("messages").scrollHeight;
}

document.addEventListener("DOMContentLoaded", init);

document.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && e.target.id === "input") {
    sendMessage();
  }
});
