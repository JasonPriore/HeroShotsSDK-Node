"use strict";

const { Resource } = require("./base");

const FOLDERS = [
  "subjects",
  "products",
  "avatars",
  "avatar-consents",
  "references",
  "background",
  "body_posture",
  "reference-videos"
];

class Uploads extends Resource {
  async image(file, folder = null) {
    const formData = await this.client._multipartFile(file);
    if (folder) {
      formData.append("folder", folder);
    }
    return this._post("/upload/image", { formData });
  }
}

module.exports = { Uploads, FOLDERS };
