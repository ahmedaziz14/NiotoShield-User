const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require("../config/supabase");

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const chatWithGemini = async (req, res) => {
    const userId = req.user.id;
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("name, interest, more_info, updated_at, admin_id, profile_picture")
            .eq("id", userId)
            .single();

        if (profileError) {
            return res.status(500).json({ error: "Failed to fetch user profile", details: profileError });
        }

        const adminId = profile?.admin_id || null;
        const userData = {};
        userData.user_profiles = profile || null;

        const { data: messages, error: messagesError } = await supabase
            .from("messages")
            .select("sender_id, receiver_id, message, created_at, is_admin")
            .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
            .order("created_at", { ascending: false })
            .limit(5);

        userData.messages = messages || [];

        const { data: notifications, error: notificationsError } = await supabase
            .from("notifications")
            .select("id, message, is_read, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(5);

        userData.notifications = notifications || [];

        const { data: locations, error: locationsError } = await supabase
            .from("localisations")
            .select("product_key, lat, lng, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        userData.locations = locations?.length > 0 ? locations[0] : null;

        // Get weather data using fetch
        let weatherData = null;
        if (userData.locations?.lat && userData.locations?.lng) {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${userData.locations.lat}&longitude=${userData.locations.lng}&current_weather=true`;

            const weatherRes = await fetch(weatherUrl);
            const weatherJson = await weatherRes.json();
            weatherData = weatherJson.current_weather || null;
        }

        const userInfoPrompt = `
You are chatting with a user. Personalize your response like a human, using their info. Be helpful, relevant, and natural. Here's their context:

👤 Profile:
- Name: ${userData.user_profiles?.name || "Unknown"}
- Interest: ${userData.user_profiles?.interest || "Not specified"}
- More Info: ${userData.user_profiles?.more_info || "None provided"}
- Updated At: ${userData.user_profiles?.updated_at || "N/A"}
- Admin ID (if relevant): ${adminId || "None"}
- Profile Picture: ${userData.user_profiles?.profile_picture || "No picture"}

Recent Messages:
${userData.messages.length > 0 
    ? userData.messages.map(m => 
        `From: ${m.sender_id === userId ? "You" : m.sender_id}, To: ${m.receiver_id === userId ? "You" : m.receiver_id}, "${m.message}", At: ${m.created_at}`).join('\n')
    : "No recent messages"}

 Notifications:
${userData.notifications.length > 0 
    ? userData.notifications.map(n => `"${n.message}", Read: ${n.is_read}, At: ${n.created_at}`).join('\n')
    : "No recent notifications"}

 Car Location:
- Latitude: ${userData.locations?.lat || "Unknown"}
- Longitude: ${userData.locations?.lng || "Unknown"}
- Time: ${userData.locations?.created_at || "N/A"}

 Weather at car location:
${weatherData
    ? `Temperature: ${weatherData.temperature}°C, Wind Speed: ${weatherData.windspeed} km/h`
    : "Weather data unavailable"}

 User's message:
"${message}"

Now, respond naturally like you're having a conversation with this person.
        `;

        const result = await model.generateContent(userInfoPrompt);
        const responseText = result.response.text();

        res.status(200).json({ reply: responseText });
    } catch (error) {
        console.error("Gemini API error:", JSON.stringify(error, null, 2));
        res.status(500).json({ error: "Failed to process request", details: error.message });
    }
};

module.exports = {
    chatWithGemini,
};
