export type DemoQwenReply = {
  answer: string
  source_url?: string
}

export function getDemoQwenAnswer(question: string): DemoQwenReply {
  const q = question.trim().toLowerCase()

  if (/pomodoro|番茄工作法|番茄钟/.test(q)) {
    return {
      answer:
        "The Pomodoro Technique is a time management method developed by Francesco Cirillo. " +
        "It divides work into 25-minute focused sessions separated by short breaks. " +
        "The technique helps improve concentration and reduce mental fatigue.",
      source_url:
        "https://en.wikipedia.org/wiki/Pomodoro_Technique",
    }
  }

  if (/python\s*3\.13/.test(q)) {
    return {
      answer:
        "Python 3.13.0 was officially released on October 7, 2024.",
      source_url:
        "https://www.python.org/downloads/release/python-3130/",
    }
  }

  if (/\brag\b|retrieval.augmented generation|检索增强生成/.test(q)) {
    return {
      answer:
        "Retrieval-Augmented Generation (RAG) combines information retrieval " +
        "with a generative language model. Relevant documents are retrieved " +
        "and supplied as context, helping the model produce grounded answers " +
        "that can be linked to supporting sources.",
      source_url:
        "https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview",
    }
  }

  return {
    answer:
      "当前是离线交互演示，未调用真实 Qwen3 模型搜索 " +
      "请尝试以下示例问题：\n\n" +
      "1. What is the Pomodoro Technique?\n" +
      "2. When was Python 3.13.0 released?\n" +
      "3. What is RAG?",
  }
}
