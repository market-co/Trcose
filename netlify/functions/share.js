
exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const type = params.type === "job" ? "job" : "product";
  const id = params.id || "";

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { statusCode: 400, body: "Invalid item ID." };
  }

  const destination = type === "job"
    ? `https://market-co.github.io/Trcose/job.html?job=${encodeURIComponent(id)}`
    : `https://market-co.github.io/Trcose/index.html#?product=${encodeURIComponent(id)}`;

  const shareUrl =
    `https://trcose.netlify.app/.netlify/functions/share?type=${type}&id=${encodeURIComponent(id)}`;

  const userAgent = (
    event.headers?.["user-agent"] ||
    event.headers?.["User-Agent"] || ""
  ).toLowerCase();

  const isPreviewBot =
    /whatsapp|facebookexternalhit|facebot|twitterbot|xbot|telegrambot|linkedinbot|slackbot|discordbot|skypeuripreview|pinterest|googlebot|bingbot|redditbot|tumblr|vkshare|viber|line-poker|applebot|embedly|quora link preview|iframely|outbrain|flipboard|bitlybot/i.test(userAgent);

  // Abantu basanzwe bahita bajya kuri page nyayo.
  // Ntibategereza Supabase.
  if (!isPreviewBot) {
    return {
      statusCode: 302,
      headers: {
        Location: destination,
        "Cache-Control": "public, max-age=60, s-maxage=300",
        Vary: "User-Agent"
      },
      body: ""
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return { statusCode: 500, body: "Missing configuration." };
  }

  const esc = value => String(value || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`
        }
      });

      if (!response.ok) {
        throw new Error("Supabase read failed");
      }

      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function readTable(table, fields) {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    url.searchParams.set("select", fields);
    url.searchParams.set("id", `eq.${id}`);
    url.searchParams.set("limit", "1");

    const rows = await fetchJson(url);
    return rows[0] || null;
  }

  try {
    let item;
    let image = "";

    if (type === "job") {
      item = await readTable(
        "jobs",
        "id,title,company,description,requirements,image_url,media_url,is_public"
      );

      if (!item || item.is_public !== true) {
        return { statusCode: 404, body: "Public job not found." };
      }

      image = item.image_url || item.media_url || "";

    } else {
      item = await readTable(
        "products",
        "id,name,title,description,image_url,image_urls,thumbnail_url,media_url,is_public"
      );

      if (!item || item.is_public === false) {
        return { statusCode: 404, body: "Public product not found." };
      }

      image =
        item.thumbnail_url ||
        item.image_url ||
        (Array.isArray(item.image_urls) ? item.image_urls[0] : "") ||
        item.media_url ||
        "";

      if (!image) {
        const url = new URL("/rest/v1/product_media", supabaseUrl);
        url.searchParams.set("select", "file_url");
        url.searchParams.set("product_id", `eq.${id}`);
        url.searchParams.set("is_public", "eq.true");
        url.searchParams.set("limit", "1");

        const media = await fetchJson(url);
        image = media[0]?.file_url || "";
      }
    }

    const title = type === "job"
      ? item.title || "Akazi kuri Trcose Market"
      : item.name || item.title || "Igicuruzwa kuri Trcose Market";

    const description = String(
      item.description ||
      item.requirements ||
      "Reba amakuru arambuye kuri Trcose Market."
    ).replace(/\s+/g, " ").trim().slice(0, 300);

    const safeImage =
      typeof image === "string" &&
      /^https:\/\//i.test(image.trim())
        ? image.trim()
        : "";

    const pageTitle = `${title} | Trcose Market`;

    const html = `<!DOCTYPE html>
<html lang="rw">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>${esc(pageTitle)}</title>

<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Trcose Market">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(shareUrl)}">
${safeImage ? `
<meta property="og:image" content="${esc(safeImage)}">
<meta property="og:image:secure_url" content="${esc(safeImage)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:image" content="${esc(safeImage)}">
` : ""}

<meta name="twitter:card" content="${safeImage ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(pageTitle)}">
<meta name="twitter:description" content="${esc(description)}">

<meta http-equiv="refresh" content="0;url=${esc(destination)}">

</head>
<body>
<h1>${esc(title)}</h1>
<p>${esc(description)}</p>
${safeImage ? `<img src="${esc(safeImage)}" alt="${esc(title)}" style="max-width:100%">` : ""}
<p><a href="${esc(destination)}">Fungura kuri Trcose Market</a></p>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        Vary: "User-Agent"
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
      body: "Ntibyashobotse kubona amakuru. Ongera ugerageze."
    };
  }
};
