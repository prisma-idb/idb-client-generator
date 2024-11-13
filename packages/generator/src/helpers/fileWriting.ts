import fs from "fs";
import path from "path";
import prettier from "prettier";
import { Project, SourceFile } from "ts-morph";

export async function writeSourceFile(
  project: Project,
  filename: string,
  outputPath: string,
  callback: (file: SourceFile) => void,
) {
  const file = project.createSourceFile(filename, "", { overwrite: true });
  callback(file);
  file.organizeImports();
  const writeLocation = path.join(outputPath, file.getBaseName());
  await writeFileSafely(writeLocation, file.getText());
}

const formatFile = (content: string, filepath: string): Promise<string> => {
  return new Promise((res, rej) =>
    prettier.resolveConfig(filepath).then((options) => {
      if (!options) res(content);

      try {
        const formatted = prettier.format(content, {
          ...options,
          parser: "typescript",
        });

        res(formatted);
      } catch (error) {
        rej(error);
      }
    }),
  );
};

const writeFileSafely = async (writeLocation: string, content: string) => {
  fs.mkdirSync(path.dirname(writeLocation), {
    recursive: true,
  });

  fs.writeFileSync(writeLocation, await formatFile(content, writeLocation));
};
