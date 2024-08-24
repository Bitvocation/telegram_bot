import axios from "axios";

export async function callUrl() {
  try {
    const bitvocationResponse = await axios.get(
      "https://bitvocation-bot-2-4.onrender.com/health"
    );
    console.log("URL called successfully bitvocation_bot:");
  } catch (error) {
    console.error("Error calling URL:", error);
  }
}
