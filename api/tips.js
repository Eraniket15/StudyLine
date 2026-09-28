module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Missing ANTHROPIC_API_KEY",
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
            "to the student's subjects, exam dates, difficulty, " +
            "and available study hours. Use plain text.",
          messages: [
            {
              role: "user",
              content:
                "Create study tips for these subjects: " +
                JSON.stringify(subjects.slice(0, 30)) +
                ". Available study hours per day: " +
                Number(hours) +
                ". Give five specific, actionable tips.",
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
        data.error?.message || "Unknown error"
      );

      return res.status(502).json({
        error: "Anthropic could not generate study tips",
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
    console.error("Study tips error:", error);

    return res.status(500).json({
      error: "Failed to generate study tips",
    });
  }
};
