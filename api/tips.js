export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is missing");

    return res.status(500).json({
      error: "AI is not configured",
    });
  }

  const { subjects, hours = 4 } = req.body || {};

  if (!Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({
      error: "Please add at least one subject",
    });
  }

  try {
    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 700,
          system:
            "You are Studyline, a friendly study coach. " +
            "Give five short, practical study tips tailored " +
            "to the student's subjects, exam dates, " +
            "difficulty levels, and available study hours. " +
            "Use plain text, with one tip per line.",
          messages: [
            {
              role: "user",
              content: `Create personalized study tips for these subjects: ${JSON.stringify(
                subjects.slice(0, 30)
              )}. Available study hours per day: ${Number(hours)}.`,
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Anthropic API error:",
        response.status,
        data.error?.type || "unknown"
      );

      return res.status(502).json({
        error: "Unable to generate AI study tips",
      });
    }

    const tips = (data.content || [])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");

    return res.status(200).json({
      tips: tips || "No study tips were generated.",
    });
  } catch (error) {
    console.error("Study tips error:", error.message);

    return res.status(500).json({
      error: "An unexpected server error occurred",
    });
  }
}
