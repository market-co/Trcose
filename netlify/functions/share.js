
exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const type = params.type === "job" ? "job" : "product";
  const id = params.id || "";

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey || !id) {
    return { statusCode: 400, body: "Missing configuration or ID." };
  }

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { statusCode: 400, body: "Invalid item ID." };
  }

  const esc = value => String(value || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

  function validImage(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "";
      }
      // Do not use a video file as the social preview image.
      if (/\.(mp4|mov|webm|m3u8|avi)(?:$|[?#])/i.test(url.href)) {
        return "";
      }
      return url.href;
    } catch {
      return "";
    }
  }

  async function readTable(table, fields, filters = {}) {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    url.searchParams.set("select", fields);
    url.searchParams.set("id", `eq.${id}`);
    url.searchParams.set("limit", "1");

    for (const [key, value] of Object.entries(filters)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Database read failed: ${table}`);
    }

    const rows = await response.json();
    return rows[0] || null;
  }

  try {
    let item;
    let image = "";

    
if (type === "job") {
  item = await readTable(
    "jobs",
    "id,title,company,description,image_url,thumbnail_url,media_url,video_url,is_public"
  );

  if (!item || item.is_public !== true) {
    return {
      statusCode: 404,
      body: "Public job not found."
    };
  }

  // Try each possible job image field.
  image =
    validImage(item.thumbnail_url) ||
    validImage(item.image_url) ||
    validImage(item.media_url) ||
    "";

  // If the job image is stored in a related media record,
  // try the existing public product_media table as a fallback.
  if (!image) {
    const mediaUrl = new URL(
      "/rest/v1/product_media",
      supabaseUrl
    );
    mediaUrl.searchParams.set("select", "file_url");
    mediaUrl.searchParams.set("product_id", `eq.${id}`);
    mediaUrl.searchParams.set("is_public", "eq.true");
    mediaUrl.searchParams.set("limit", "10");

    const response = await fetch(mediaUrl, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      }
    });

    if (response.ok) {
      const media = await response.json();
      image = (media || [])
        .map(row => validImage(row.file_url))
        .find(Boolean) || "";
    }
  }
} else {
    }

    const title = type === "job"
      ? item.title || "Job kuri Trcose Market"
      : item.name || item.title || "Product kuri Trcose Market";

    const description = item.description ||
      "Reba amakuru arambuye kuri Trcose Market.";

    // Keep the correct destination format for each type.
    const destination = type === "job"
      ? new URL(
          `job.html?job=${encodeURIComponent(id)}`,
          "https://market-co.github.io/Trcose/"
        )
      : new URL(
          `index.html#?product=${encodeURIComponent(id)}`,
          "https://market-co.github.io/Trcose/"
        );

    const shareUrl = event.rawUrl || destination.href;

    const html = `<!doctype html>
<html lang="rw">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | Trcose Market</title>
<meta name="description" content="${esc(description)}">

<meta property="og:site_name" content="Trcose Market">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(shareUrl)}">
<meta property="og:locale" content="rw_RW">
${image ? `
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta name="twitter:image" content="${esc(image)}">
` : ""}
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">

<meta http-equiv="refresh" content="1;url=${esc(destination.href)}">
</head>
<body>
<p>Urimo gufungura <a href="${esc(destination.href)}">Trcose Market</a>...</p>
<script>
  location.replace(${JSON.stringify(destination.href)});
</script>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60"
      },
      body: html
    };
  } catch (error) {
    console.error("Share function error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: "Ntibyashobotse kubona amakuru. Reba Netlify logs na Supabase permissions."
    };
  }
};
