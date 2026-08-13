// next-sitemap.config.js
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_DOMAIN ?? "https://google.com", // Replace with your domain
  generateRobotsTxt: true, // (Optional) Generates a robots.txt file
  sitemapSize: 7000, // (Optional) Limit sitemap size, default is 5000
  exclude: ["/admin/*", "/private/*"], // (Optional) Exclude specific paths
  changefreq: "weekly", // (Optional) Set default change frequency
  priority: 0.7, // (Optional) Set default priority for URLs,
  // sourceDir: 'app',
  robotsTxtOptions: {
    policies: [
      { userAgent: "*", allow: "/" },
      { userAgent: "Googlebot", allow: "/blog" },
      { userAgent: "Bingbot", disallow: "/private" }
    ]
  }
};
