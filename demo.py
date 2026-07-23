from openai import OpenAI
import os
import sys


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def load_env_file(path=".env"):
    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            name, value = line.split("=", 1)
            os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


load_env_file()
api_key = os.getenv("OPENROUTER_API_KEY")
if not api_key:
    raise RuntimeError(
        "OPENROUTER_API_KEY is not set. Add it to a .env file or set it in your environment."
    )

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=api_key,
)

messages = [
    {
        "role": "system",
        "content": "You are a helpful assistant.",
    }
]

print("Chat started. Type 'exit' or 'quit' to stop.")

while True:
    user_input = input("\nYou: ").strip()
    if user_input.lower() in {"exit", "quit"}:
        print("Goodbye!")
        break

    if not user_input:
        continue

    messages.append({"role": "user", "content": user_input})

    response = client.chat.completions.create(
        model="deepseek/deepseek-r1-0528",
        max_tokens=512,
        messages=messages,
    )

    assistant_reply = response.choices[0].message.content
    messages.append({"role": "assistant", "content": assistant_reply})
    print(f"\nAssistant: {assistant_reply}")
