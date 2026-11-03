import httpx


class BudgetExceeded(Exception):
    pass


class OpenAICompatLLM:
    def __init__(self, base_url, api_key, model, max_calls, temperature=0.0, transport=None, timeout=60):
        self.model = model
        self.max_calls = max_calls
        self.temperature = temperature
        self.calls = 0
        self.client = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
            transport=transport,
        )

    def __call__(self, messages, tools):
        if self.calls >= self.max_calls:
            raise BudgetExceeded(f"hit cap of {self.max_calls} LLM calls")
        self.calls += 1
        response = self.client.post("/chat/completions", json={
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "temperature": self.temperature,
        })
        response.raise_for_status()
        return response.json()["choices"][0]["message"]
