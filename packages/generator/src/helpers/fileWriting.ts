import fs from "fs";
import path from "path";
import prettier from "prettier";
import CodeBlockWriter from "code-block-writer";

export async function writeCodeFile(filename: string, outputPath: string, callback: (writer: CodeBlockWriter) => void) {
  const writer = new CodeBlockWriter({
    indentNumberOfSpaces: 2,
    useTabs: false,
    useSingleQuote: false,
  });
  callback(writer);

  const writeLocation = path.join(outputPath, filename);
  const content = writer.toString();
  await writeFileSafely(writeLocation, content);
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
